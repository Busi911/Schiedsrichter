import "server-only";
import sharp from "sharp";

// Vereinslogo -> Web-App-Icon/Kopfbild. Das Logo kommt vom Vereinsadmin
// (Upload), wird hier GEPRÜFT und auf ein einheitliches PNG normalisiert:
// nur Rastergrafiken (PNG/JPEG/WebP — kein SVG wegen Script-/XSS-Risiko),
// begrenzte Größe, EXIF-Drehung angewendet, Metadaten entfernt (sharp gibt
// beim Neu-Kodieren standardmäßig keine EXIF/GPS-Daten aus).
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const ERLAUBTE_FORMATE = new Set(["png", "jpeg", "webp"]);

export class LogoFehler extends Error {}

export async function verarbeiteLogo(eingabe: Buffer): Promise<Buffer> {
  if (eingabe.length === 0 || eingabe.length > LOGO_MAX_BYTES) {
    throw new LogoFehler("Das Logo darf höchstens 5 MB groß sein.");
  }
  let format: string | undefined;
  try {
    format = (await sharp(eingabe, { limitInputPixels: 40_000_000 }).metadata()).format;
  } catch {
    throw new LogoFehler("Die Datei ist keine gültige Bilddatei.");
  }
  if (!format || !ERLAUBTE_FORMATE.has(format)) {
    throw new LogoFehler("Bitte ein Logo als PNG, JPEG oder WebP hochladen.");
  }
  return sharp(eingabe, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// App-Icon in gewünschter Größe: Logo mit Rand (Sicherheitszone für
// "maskable"-Icons, die abgerundet/zugeschnitten werden) auf weißem Grund —
// iOS ersetzt Transparenz sonst durch Schwarz.
export async function baueLogoIcon(png512: Buffer, groesse: number): Promise<Buffer> {
  const innen = Math.round(groesse * 0.72);
  const logo = await sharp(png512).resize(innen, innen, { fit: "contain" }).png().toBuffer();
  return sharp({
    create: { width: groesse, height: groesse, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}
