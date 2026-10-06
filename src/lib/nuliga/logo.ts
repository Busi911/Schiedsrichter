import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ligaVereine, ligaVereinLogos } from "@/db/schema";
import { ermittleFarbton, LogoFehler, pruefeOriginalLogo } from "@/lib/liga-logo";
import type { HoleBild } from "./client";
import type { LigaDb } from "./sync";
import { absoluteNuligaUrl } from "./verbaende";

export const LOGO_REFRESH_TAGE = 7;

export type LogoErgebnis = {
  status: "neu" | "aktualisiert" | "unveraendert" | "kein_logo" | "manuell" | "aus" | "fehler";
  detail?: string;
};

// Übernimmt das nuLiga-Vereinslogo in unser eigenes Logo des Vereins (liga_verein_logo, das UNVERÄNDERTE Original
// in der Datenbank — dieselbe Ablage wie beim Upload; die Seite liefert es über /verein/[slug]/logo, nie per
// Hotlink von nuLiga). Regeln:
// - ein vom Verein selbst hochgeladenes Logo wird NIE überschrieben, ein vom Verein entfernte Logo nicht neu geholt;
// - gleiche Originaldatei (SHA-256) = kein erneutes Verarbeiten und kein neuer Cache-Buster;
// - jede Prüfung (auch ohne Logo oder mit Fehler) setzt logo_geprueft_am, damit nicht ständig neu versucht wird.
export async function uebernehmeNuligaLogo(opt: {
  db: LigaDb;
  ligaVereinId: string;
  verband?: string;
  logoPfad: string | null;
  holeBild: HoleBild;
  jetzt?: Date;
}): Promise<LogoErgebnis> {
  const jetzt = opt.jetzt ?? new Date();
  const verband = opt.verband ?? "HHV";
  const markiere = () => opt.db.update(ligaVereine).set({ logoGeprueftAm: jetzt }).where(eq(ligaVereine.id, opt.ligaVereinId));

  const verein = await opt.db.query.ligaVereine.findFirst({
    where: eq(ligaVereine.id, opt.ligaVereinId),
    columns: { logoAutoAus: true },
  });
  if (!verein || verein.logoAutoAus) return { status: "aus" };
  const bestehend = await opt.db.query.ligaVereinLogos.findFirst({ where: eq(ligaVereinLogos.ligaVereinId, opt.ligaVereinId) });
  if (bestehend?.quelle === "upload") {
    await markiere();
    return { status: "manuell" };
  }
  if (!opt.logoPfad) {
    await markiere();
    return { status: "kein_logo" };
  }

  try {
    const { daten } = await opt.holeBild(absoluteNuligaUrl(verband, opt.logoPfad));
    const hash = createHash("sha256").update(daten).digest("hex");
    if (bestehend && bestehend.quellHash === hash) {
      await opt.db
        .update(ligaVereinLogos)
        .set({ abgerufenAm: jetzt, quellPfad: opt.logoPfad })
        .where(eq(ligaVereinLogos.ligaVereinId, opt.ligaVereinId));
      await markiere();
      return { status: "unveraendert" };
    }
    // Original unverändert speichern (Proportionen bleiben, die Anzeige nutzt object-contain); nur prüfen.
    const { mime } = await pruefeOriginalLogo(daten);
    const farbton = await ermittleFarbton(daten);
    const werte = { png: daten, mime, farbton, aktualisiertAm: jetzt, quelle: "nuliga", quellPfad: opt.logoPfad, quellHash: hash, abgerufenAm: jetzt };
    await opt.db
      .insert(ligaVereinLogos)
      .values({ ligaVereinId: opt.ligaVereinId, ...werte })
      .onConflictDoUpdate({ target: ligaVereinLogos.ligaVereinId, set: werte });
    await markiere();
    return { status: bestehend ? "aktualisiert" : "neu" };
  } catch (err) {
    await markiere();
    return { status: "fehler", detail: err instanceof LogoFehler || err instanceof Error ? err.message : String(err) };
  }
}
