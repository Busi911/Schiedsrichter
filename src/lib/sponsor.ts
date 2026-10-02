import "server-only";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { vereinSponsoren } from "@/db/schema";

// Sponsorenbild eines Vereins (übernimmt die technischen Kosten, siehe vereinSponsoren in db/schema.ts).
// Das Bild kommt vom Systemadmin, wird hier GEPRÜFT und zu einem kleinen WebP normalisiert: nur Rastergrafiken
// (PNG/JPEG/WebP — kein SVG wegen Script-/XSS-Risiko), begrenzte Größe, EXIF entfernt.
export const SPONSOR_BILD_MAX_BYTES = 5 * 1024 * 1024;
const ERLAUBTE_FORMATE = new Set(["png", "jpeg", "webp"]);
export const SPONSOR_DAUER_MIN = 2;
export const SPONSOR_DAUER_MAX = 8;

export class SponsorFehler extends Error {}

export async function verarbeiteSponsorBild(eingabe: Buffer): Promise<Buffer> {
  if (eingabe.length === 0 || eingabe.length > SPONSOR_BILD_MAX_BYTES) {
    throw new SponsorFehler("Das Bild darf höchstens 5 MB groß sein.");
  }
  let format: string | undefined;
  try {
    format = (await sharp(eingabe, { limitInputPixels: 40_000_000 }).metadata()).format;
  } catch {
    throw new SponsorFehler("Die Datei ist keine gültige Bilddatei.");
  }
  if (!format || !ERLAUBTE_FORMATE.has(format)) {
    throw new SponsorFehler("Bitte ein Bild als PNG, JPEG oder WebP hochladen.");
  }
  return verkleinere(eingabe);
}

// Klein halten, damit das Bild beim Öffnen sofort da ist: höchstens 640×480 px (reicht für ein Overlay
// auch auf hochauflösenden Handys), WebP (behält Transparenz), typisch wenige zehn KB.
async function verkleinere(bild: Buffer): Promise<Buffer> {
  return sharp(bild, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(640, 480, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toBuffer();
}

// Nur https-Links (kein javascript:/data:), ohne Leerzeichen, begrenzte Länge.
export function pruefeSponsorLink(roh: string): string | null {
  const t = roh.trim();
  if (!t) return null;
  if (t.length > 500 || /\s/.test(t)) throw new SponsorFehler("Der Link ist ungültig.");
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new SponsorFehler("Der Link ist ungültig (z.B. https://www.beispiel.de).");
  }
  if (url.protocol !== "https:") throw new SponsorFehler("Der Link muss mit https:// beginnen.");
  return url.toString();
}

export type SponsorAnsicht = { name: string | null; link: string | null; dauerSekunden: number; version: string };

// Rein: wirkt der Sponsor heute? (aktiv, Bild vorhanden, Vertragszeitraum nicht abgelaufen)
export function sponsorWirksam(
  s: { aktiv: boolean; hatBild: boolean; gueltigBis: string | null },
  heute: string
): boolean {
  return s.aktiv && s.hatBild && (s.gueltigBis === null || s.gueltigBis >= heute);
}

const heuteBerlin = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

// Für die öffentliche Seite: der wirksame Sponsor des Vereins oder null. Lädt das Bild nicht mit.
export async function holeSponsor(vereinId: string): Promise<SponsorAnsicht | null> {
  const [z] = await mitColdStartRetry(() =>
    adminDb
      .select({
        aktiv: vereinSponsoren.aktiv,
        name: vereinSponsoren.name,
        link: vereinSponsoren.link,
        dauer: vereinSponsoren.dauerSekunden,
        gueltigBis: vereinSponsoren.gueltigBis,
        aktualisiert: vereinSponsoren.aktualisiertAm,
        hatBild: sql<boolean>`${vereinSponsoren.png} is not null`,
      })
      .from(vereinSponsoren)
      .where(eq(vereinSponsoren.vereinId, vereinId))
  );
  if (!z || !sponsorWirksam({ aktiv: z.aktiv, hatBild: z.hatBild, gueltigBis: z.gueltigBis }, heuteBerlin())) return null;
  return { name: z.name, link: z.link, dauerSekunden: z.dauer, version: String(z.aktualisiert.getTime()) };
}

export async function holeSponsorBild(vereinId: string): Promise<Buffer | null> {
  const [z] = await mitColdStartRetry(() =>
    adminDb.select({ png: vereinSponsoren.png }).from(vereinSponsoren).where(eq(vereinSponsoren.vereinId, vereinId))
  );
  const bild = z?.png ?? null;
  // Früher gespeicherte Bilder (großes PNG) werden beim Ausliefern verkleinert; der Browser/CDN cached es lange.
  if (bild && (await sharp(bild).metadata()).format !== "webp") return verkleinere(bild);
  return bild;
}
