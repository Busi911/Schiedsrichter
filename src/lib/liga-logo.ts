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

// Hauptfarbe (Farbton 0-359) des Logos: Pixel nach Farbton in 24 Klassen
// zählen, gewichtet nach Sättigung; transparente sowie graue/sehr helle/sehr
// dunkle Pixel zählen nicht (Rahmen, Schrift, Hintergrund). Gibt null zurück,
// wenn das Logo praktisch farblos ist.
export async function ermittleFarbton(png: Buffer): Promise<number | null> {
  const { data, info } = await sharp(png)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const KLASSEN = 24;
  const gewicht = new Array<number>(KLASSEN).fill(0);
  let gesamt = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const alpha = data[i * 4 + 3];
    if (alpha < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const hell = (max + min) / 2;
    if (chroma < 0.15 || hell > 0.92 || hell < 0.08) continue; // grau/weiß/schwarz
    let h: number;
    if (max === r) h = ((g - b) / chroma + 6) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;
    const grad = h * 60;
    const klasse = Math.floor(grad / (360 / KLASSEN)) % KLASSEN;
    gewicht[klasse] += chroma;
    gesamt += chroma;
  }
  if (gesamt < 3) return null; // praktisch farblos

  // Benachbarte Klassen mitzählen, damit ein Farbton an einer Klassengrenze
  // nicht gegen eine einzelne etwas größere Klasse verliert.
  let beste = 0;
  let besterWert = -1;
  for (let k = 0; k < KLASSEN; k++) {
    const wert = gewicht[k] + 0.5 * (gewicht[(k + 1) % KLASSEN] + gewicht[(k + KLASSEN - 1) % KLASSEN]);
    if (wert > besterWert) {
      besterWert = wert;
      beste = k;
    }
  }
  return Math.round(beste * (360 / KLASSEN) + 360 / KLASSEN / 2) % 360;
}
