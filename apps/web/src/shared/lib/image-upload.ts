/** Longest side of an attached photo after shrinking; plenty for reading a screenshot. */
const MAX_SIDE = 2000;
/** Must stay within what the API accepts (3 MB). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const KEEP_AS_IS_BYTES = 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Prepares a picked or pasted image for upload: small files and GIFs (which may be animated) are
 * kept as they are; larger photos and screenshots are scaled down and re-encoded, which also drops
 * location data stored in photos.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (!ALLOWED.includes(file.type)) throw new Error(`${file.name || 'This file'} is not a JPEG, PNG, GIF or WebP image`);
  if (file.type === 'image/gif' || (file.size <= KEEP_AS_IS_BYTES && file.type !== 'image/jpeg')) return checkSize(file);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return checkSize(file);
  // A white background, so transparent areas do not turn black when saved as JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Screenshots (PNG) keep crisp text as PNG unless that is too big; photos become JPEG.
  let blob = file.type === 'image/png' ? await encode('image/png') : null;
  if (!blob || blob.size > KEEP_AS_IS_BYTES * 2) blob = await encode('image/jpeg', 0.85);
  if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await encode('image/jpeg', 0.7);
  return checkSize(blob ?? file);
}

function checkSize(blob: Blob): Blob {
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('This image is too large (max 3 MB)');
  return blob;
}
