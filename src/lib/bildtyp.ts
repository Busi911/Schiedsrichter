// Bildtyp aus den ersten Bytes (Magic Bytes), nie aus URL-Endung oder allein aus dem Content-Type.
export type Bildtyp = { format: "png" | "jpeg" | "gif" | "webp"; mime: string; endung: string };

export function erkenneBildtyp(daten: Uint8Array): Bildtyp | null {
  const b = daten;
  const ist = (start: number, bytes: number[]) => bytes.every((x, i) => b[start + i] === x);
  if (b.length >= 8 && ist(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { format: "png", mime: "image/png", endung: "png" };
  if (b.length >= 3 && ist(0, [0xff, 0xd8, 0xff])) return { format: "jpeg", mime: "image/jpeg", endung: "jpg" };
  if (b.length >= 4 && ist(0, [0x47, 0x49, 0x46, 0x38])) return { format: "gif", mime: "image/gif", endung: "gif" };
  // WebP: "RIFF" + 4 Byte Länge + "WEBP"
  if (b.length >= 12 && ist(0, [0x52, 0x49, 0x46, 0x46]) && ist(8, [0x57, 0x45, 0x42, 0x50])) return { format: "webp", mime: "image/webp", endung: "webp" };
  return null;
}

const BILD_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/gif", "image/webp"]);
const GENERISCH = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-download", "application/download"]);

// Content-Type nur als Hinweis: ein Bildtyp oder ein generischer Typ ist zulässig (dann entscheiden die
// Magic Bytes), alles andere (text/html, application/json ...) ist KEIN Bild.
export function contentTypeKannBildSein(contentType: string): boolean {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  return BILD_MIME.has(ct) || GENERISCH.has(ct);
}
