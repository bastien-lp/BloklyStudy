/**
 * Web Push from a Cloudflare Worker — no dependency, Web Crypto only.
 * --------------------------------------------------------------------------
 * Implements:
 *   - RFC 8291 (Message Encryption for Web Push) with the aes128gcm content
 *     coding of RFC 8188: an ephemeral ECDH P-256 key per message, HKDF
 *     (built from HMAC-SHA-256), AES-128-GCM, a single record;
 *   - RFC 8292 (VAPID): an ES256-signed JWT identifying the application
 *     server, sent as `Authorization: vapid t=<jwt>, k=<public key>`.
 *
 * Keys (see README): VAPID_PUBLIC_KEY is the uncompressed P-256 point
 * (65 bytes, base64url) — also given to the browser; VAPID_PRIVATE_KEY is
 * the 32-byte private scalar (base64url), stored as a Worker secret.
 */

const enc = new TextEncoder();

export function b64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export function bytesToB64url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF-Expand for a single block (length ≤ 32), per RFC 5869. */
async function hkdfExpand(prk, info, length) {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/**
 * Encrypts `plaintext` for one subscription (RFC 8291 / aes128gcm).
 * `salt` and `asKeyPair` can be injected for tests; otherwise random / fresh.
 * Returns the request body (header + ciphertext).
 */
export async function encryptPayload({ p256dh, auth, plaintext, salt, asKeyPair }) {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad_subscription_keys');

  const keys = asKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);

  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(s, ikm);
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext followed by the 0x02 "last record" delimiter.
  const padded = concat(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(s, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Imports the VAPID private key (32-byte scalar + the public point) for ES256 signing. */
async function vapidSigningKey(publicB64, privateB64) {
  const pub = b64urlToBytes(publicB64);
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    d: privateB64,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** `Authorization` header value for a push service origin (RFC 8292). */
export async function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, nowSec = Math.floor(Date.now() / 1000)) {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: nowSec + 12 * 3600,
    sub: subject,
  })));
  const key = await vapidSigningKey(publicKey, privateKey);
  // Web Crypto returns the raw r||s signature JWS expects.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${bytesToB64url(sig)}, k=${publicKey}`;
}

/**
 * Sends one push. `payload` is an object (JSON-encoded, kept under ~3 KB).
 * Resolves to the push service's HTTP status: 201 = accepted,
 * 404 / 410 = the subscription is gone and should be deleted.
 */
export async function sendPush(subscription, payload, vapid, { ttl = 86_400, urgency = 'normal', topic } = {}) {
  const body = await encryptPayload({
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    plaintext: JSON.stringify(payload).slice(0, 3000),
  });
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
      ...(topic ? { Topic: topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
    },
    body,
  });
  return res.status;
}
