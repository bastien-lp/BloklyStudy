/**
 * Client-side image downscaling (canvas), shared by profile photos and
 * uploaded documents.
 * --------------------------------------------------------------------------
 * Phone photos are 3–10 MB. Shrinking them in the browser before anything is
 * stored keeps Firestore documents small and saves R2 space. Browsers apply
 * the EXIF orientation when drawing an <img>, so portrait shots stay upright.
 */

/** Loads a File/Blob into an HTMLImageElement. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_unreadable')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('image_encode_failed'))), type, quality);
  });
}

/**
 * Downscales `file` so its longest side is at most `maxSize` px.
 * With `square: true`, center-crops to a `maxSize` × `maxSize` square.
 * JPEG output gets a white background (no black where PNGs were transparent).
 * Resolves to a Blob.
 */
export async function resizeImage(file, { maxSize, square = false, type = 'image/jpeg', quality = 0.85 }) {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  let sx = 0, sy = 0, sw = w, sh = h;
  if (square) {
    const side = Math.min(w, h);
    sx = (w - side) / 2;
    sy = (h - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));

  const ctx = canvas.getContext('2d');
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, type, quality);
}

/** Blob → "data:…;base64,…" string. */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
