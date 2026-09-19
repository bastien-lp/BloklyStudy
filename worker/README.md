# Blokly worker

Cloudflare Worker for the things a static front-end can't do alone, without
Firebase Cloud Functions (Spark plan):

| Route | Feature | Cloudflare products (free plan) |
|---|---|---|
| `GET /events` | External `.ics` calendars in the Planning page | Workers, KV (fallback copy) |
| `POST /ai/flashcards` | Flashcards generated from course notes | Workers AI, KV (daily quota) |
| `/docs…`, `/groups/:id/docs` | Synthesis documents, shared with groups | R2 (files), D1 (metadata + accounting), KV (daily upload cap) |
| `/library…`, `/docs/:id/library` | Public synthesis library (search across schools) | D1 (entries + FTS5 search index) |

Both routes require a Firebase ID token; the uid always comes from the
verified token.

## External calendars

Lets the Planning page show a user's external `.ics` calendars (e.g. a school
timetable) read-only, without exposing the private feed URL to the browser.

### How it works

```
Browser (Planning)                    Worker                          Google / feed host
  │ GET /events                        │                                 │
  │ Authorization: Bearer <ID token> ─▶│ verify token (Google JWKS) ────▶│
  │                                    │ read users/{uid}/data/calendars │
  │                                    │   via Firestore REST, *as the   │
  │                                    │   user* (rules apply) ─────────▶│
  │                                    │ fetch each .ics, parse ─────────▶│
  │◀── { calendars: [{ id, events }] } │                                 │
```

- The uid comes only from the verified token.
- The worker holds **no admin credential**: it calls Firestore with the user's
  own ID token, so security rules decide what it can read.
- Only `{ title, start, end, allDay }` is returned — never the feed URL.
- Feeds are fetched every time the Planning page opens. The last feed that
  parsed correctly is also kept in KV (key = SHA-256 of the URL, 30-day TTL,
  refreshed at most every 6 h to spare the 1,000 writes/day free quota). If
  the feed host is down, that copy is served with `stale: true` rather than an
  empty calendar. Note: this means the timetable content sits in KV.

## AI flashcards

`POST /ai/flashcards` with `{ text, count, lang }` returns `{ cards: [{ q, a }], remaining }`.
The Flashcards page shows a "Generate" tab in the add-card modal only when
`VITE_CALENDAR_WORKER_URL` is set. Nothing is stored: the notes go to the
model and the cards go back to the browser, which saves them like imported
cards. Details and error codes: `src/ai.js`.

**Budget.** Workers AI's free allocation is 10,000 neurons/day, shared by the
whole account; past it, requests are refused (never billed) and users see
"at capacity, try tomorrow". To make it last:
- notes ≤ 8,000 characters, ≤ 15 cards per generation;
- `AI_DAILY_LIMIT` successful generations per user per day (default 5);
- `AI_MODEL` is configurable. The 70B default gives the best French; a smaller
  model (e.g. `@cf/meta/llama-3.1-8b-instruct-fast`) costs several times less
  per generation. Check current per-model pricing in the Workers AI docs.

## Synthesis documents (R2 + D1)

Students upload PDFs, images, Office and text files from the Syntheses page
(filed by subject / chapter) and share them with their study groups. Route
list and access rules: `src/docs.js`. Schema: `migrations/0001_documents.sql`.

**The 10 GB free tier can never be reached.** The worker is the only writer to
the bucket, and it reserves every byte in D1 *before* writing to R2, with one
atomic conditional `INSERT` (global total, per-user quota and file count are
all checked inside the same statement). A failed R2 write removes the
reservation, so D1 can only over-count R2, never under-count. Tested with 12
simultaneous uploads racing for a small cap: exactly the ones that fit went
through.

| Limit (`wrangler.toml`) | Default | Why |
|---|---|---|
| `DOCS_GLOBAL_CAP_MB` | 8192 (8 GB) | hard ceiling, 2 GB under the free 10 GB |
| `DOCS_USER_QUOTA_MB` | 50 | fair share per student |
| `DOCS_MAX_FILE_MB` | 10 | a synthesis PDF is usually 0.5–5 MB |
| `DOCS_MAX_FILES_PER_USER` | 200 | |
| `DOCS_MAX_UPLOADS_PER_DAY` | 40 | protects the free R2 write-operation quota |

When the global cap is close, the app shows "uploads paused" and existing
files stay readable. Photos are downscaled in the browser (2400 px) before
upload; image thumbnails (≈20 KB) count toward the quota too.

**Access.** Private to the owner until shared with a group; group membership
is re-checked against Firestore (with the caller's own token) on every read,
so leaving a group removes access. File types are detected from the bytes
(magic numbers), never trusted from the client; HTML/SVG/scripts are refused.

**Firestore.** Nothing is added to existing documents. Sharing posts a chat
message in `groups/{id}/messages` with `type: 'doc'` and a
`doc: { id, name, kind, size, hasThumb }` summary. If the message rules
whitelist types or fields, `doc` must be allowed there.

## Public synthesis library

Students can publish any of their documents to a library every signed-in
user can browse (Syntheses page → "Bibliothèque"). Details: `src/library.js`,
schema: `migrations/0002_library.sql`.

- **Opt-in, per document**, with title, subject, school, level, language and
  a description. Publishing does not copy the file: **no extra storage**.
  It can be undone at any time; deleting the document removes the entry.
- **Search**: SQLite FTS5 in D1, accent-insensitive with prefix matching
  (`chimi` finds "Chimie organique — résumé"). Filters on normalized keys,
  so different spellings of one school merge; the chips show the most used
  spelling with its count, each list narrowed by the other filter.
- **Likes, favourites, views** (views count other people opening the file).
- **Moderation**: one report per user and document; at
  `LIBRARY_HIDE_AFTER_REPORTS` (3) distinct reports the document is hidden
  and becomes private again. `ADMIN_UIDS` get a moderation list in the app
  (restore / remove / hide) and can open hidden documents to review them.

## Firestore data

`users/{uid}/data/calendars`:

```js
{ calendars: [{ id: 'k3j9x0aa', name: 'Cours', url: 'https://…', color: '#2E8B57' }] }
```

Kept out of `users/{uid}/data/main` on purpose: `main` is read by other users
(public profile modal), and feed URLs embed private tokens.

## Firestore rules (to add)

```
match /users/{uid}/data/calendars {
  allow read, delete: if request.auth != null && request.auth.uid == uid;
  allow create, update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['calendars'])
    && request.resource.data.calendars is list
    && request.resource.data.calendars.size() <= 10;
}
```

Firestore rules are OR-ed: if a broader rule (e.g. `match /users/{uid}/data/{doc}`
with `allow read: if request.auth != null`) also matches this path, other users
could still read the document. Such a rule must exclude `calendars`.

## Local development

```bash
cd worker
npm install
npm run dev          # http://localhost:8787, fully local, no login — AI disabled
npm run dev:ai       # same, but Workers AI works (needs `npx wrangler login`;
                     # AI calls run on Cloudflare and use the daily budget)
```

In the app root, `.env.local` (git-ignored) points the front-end at it:

```
VITE_CALENDAR_WORKER_URL=http://localhost:8787
```

Allowed browser origins are set in `wrangler.toml` (`ALLOWED_ORIGINS`).

## Deploying (later)

1. `npx wrangler kv namespace create KV` and paste the id into `wrangler.toml`
   (replacing `local-dev-placeholder`).
2. `npx wrangler r2 bucket create blokly-docs`
3. `npx wrangler d1 create blokly`, paste the id into `wrangler.toml`, then
   `npx wrangler d1 migrations apply blokly --remote` (applies every file in
   `migrations/`, the library included; re-run it after adding a migration).
4. `npm run deploy` (needs `wrangler login`), then set `VITE_CALENDAR_WORKER_URL`
   to the `*.workers.dev` URL for production builds.

Local D1 needs the schema once: `npx wrangler d1 migrations apply blokly --local`.

Free-plan note: Workers allow 10 ms of CPU per request. Parsing a ~45 KB
timetable takes ~5 ms warm (≈20 ms on a cold start); fetch/network time does
not count toward that limit.
