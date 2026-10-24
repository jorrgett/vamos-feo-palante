"use client";

import { loadPhoto } from "./photo-cropper";

/** Achica la foto en el teléfono antes de subirla (lado mayor `maxSide`, JPEG). También abre HEIC. */
export async function compressImage(file: Blob, maxSide = 1568, quality = 0.85): Promise<Blob> {
  const canvas = await loadPhoto(file, maxSide);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("blob"))), "image/jpeg", quality));
}
