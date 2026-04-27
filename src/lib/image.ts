// Tiny helpers to load a File/Blob, downscale to a thumbnail, and produce ObjectURLs.

export function blobToObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  } finally {
    // Caller should revoke when done with the image, but we revoke here since
    // we only used it to decode.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function makeThumbnail(
  blob: Blob,
  maxSize = 320,
  quality = 0.78,
): Promise<{ thumb: Blob; width: number; height: number }> {
  const img = await loadImage(blob);
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const thumb = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality),
  );
  return { thumb, width: img.width, height: img.height };
}

export async function fileToBlob(file: File): Promise<Blob> {
  return file;
}

// Re-encode a captured/uploaded photo at a sensible long-edge cap so a
// year of daily photos fits in tens-to-hundreds of MB instead of multiple
// GB. Returns the original blob unchanged when it's already small enough
// — re-encoding a tiny JPEG only adds artifacts.
export async function compressForStorage(
  blob: Blob,
  maxSize = 1600,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(blob);
  const longEdge = Math.max(img.width, img.height);
  const alreadySmall =
    longEdge <= maxSize && blob.type === 'image/jpeg' && blob.size < 800 * 1024;
  if (alreadySmall) {
    return { blob, width: img.width, height: img.height };
  }
  const ratio = Math.min(1, maxSize / longEdge);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const out = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality),
  );
  // Rare: re-encoding made it bigger (e.g. small PNG with flat colors).
  // Keep the original JPEG in that case.
  if (out.size >= blob.size && blob.type === 'image/jpeg') {
    return { blob, width: img.width, height: img.height };
  }
  return { blob: out, width: w, height: h };
}
