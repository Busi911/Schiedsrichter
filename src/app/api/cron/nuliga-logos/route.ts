import { and, asc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine } from "@/db/schema";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeNuligaBild, holeNuligaSeiteMitKontext } from "@/lib/nuliga/client";
import { LOGO_REFRESH_TAGE, uebernehmeNuligaLogo } from "@/lib/nuliga/logo";
import { parseVereinsInfo } from "@/lib/nuliga/parsers/vereinsinfo";
import { speichereStammdaten } from "@/lib/nuliga/stammdaten";
import { baueNuligaUrl } from "@/lib/nuliga/verbaende";

export const maxDuration = 60;

// Täglich: Vereinslogos aus nuLiga prüfen. Je Verein höchstens alle 7 Tage (logo_geprueft_am); die am längsten
// ungeprüften zuerst, Frist 40 s, der Rest folgt am nächsten Tag. Vereinslogo-Pfad (wodata) wird dafür jedes
// Mal frisch aus der Vereinsseite gelesen. Eigene/entfernte Logos werden nie angefasst (siehe lib/nuliga/logo.ts).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const frist = Date.now() + 40_000;
  const grenze = new Date(Date.now() - LOGO_REFRESH_TAGE * 24 * 3600 * 1000);
  const vereine = await adminDb
    .select({ id: ligaVereine.id, clubId: ligaVereine.nuligaClubId, verband: ligaVereine.verband })
    .from(ligaVereine)
    .where(
      and(
        isNotNull(ligaVereine.nuligaClubId),
        eq(ligaVereine.logoAutoAus, false),
        or(isNull(ligaVereine.logoGeprueftAm), lt(ligaVereine.logoGeprueftAm, grenze))
      )
    )
    .orderBy(asc(ligaVereine.logoGeprueftAm));

  const ergebnis: Record<string, number> = {};
  let geprueft = 0;
  for (const v of vereine) {
    if (Date.now() > frist) break;
    try {
      const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl(v.verband, "clubInfoDisplay", { club: v.clubId! }));
      const { daten } = parseVereinsInfo(seite.html);
      await speichereStammdaten(adminDb, v.id, daten);
      const r = await uebernehmeNuligaLogo({ db: adminDb, ligaVereinId: v.id, verband: v.verband, logoPfad: daten.logoPfad, holeBild: holeNuligaBild, kontext: seite.kontext });
      ergebnis[r.status] = (ergebnis[r.status] ?? 0) + 1;
    } catch (err) {
      // Seite nicht lesbar: bewusst NICHT als geprüft markieren, damit es der nächste Lauf wieder versucht.
      ergebnis.seite_fehler = (ergebnis.seite_fehler ?? 0) + 1;
      console.error("Logo-Abgleich fehlgeschlagen:", v.clubId, err);
    }
    geprueft++;
  }
  return Response.json({ faellig: vereine.length, geprueft, ergebnis });
}
