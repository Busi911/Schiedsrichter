import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { termine } from "@/db/schema";
import { normalisiereMannschaftsname } from "./rundenspiel-import";

// Admins legen Testspiele oft manuell an, bevor der Verband/nuLiga das
// Spiel offiziell führt (z.B. weil noch kein Schiedsrichter feststeht) —
// erscheint das Spiel später über den automatischen nuLiga-Sync als
// "rundenspiel", existieren beide Termine parallel und doppeln sich im
// Kalender. Absichtlich nur eine Vorschlagsliste zum manuellen Aufräumen
// (kein Auto-Löschen): weder Team-Name-Substring-Match noch Zeitnähe sind
// zuverlässig genug, um blind einen Termin zu löschen.
const ZEITFENSTER_MS = 4 * 60 * 60 * 1000;

function berlinTag(d: Date): string {
  return d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

export type MoeglichesDuplikat = {
  testspielId: string;
  testspielStart: Date;
  testspielBeschreibung: string | null;
  rundenspielId: string;
  rundenspielStart: Date;
  rundenspielBeschreibung: string | null;
};

export async function findeTestspielDuplikate(
  vereinId: string
): Promise<MoeglichesDuplikat[]> {
  return withTenant(vereinId, async (tx) => {
    const testspiele = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "testspiel"),
        eq(termine.quelle, "manuell")
      ),
    });
    if (testspiele.length === 0) return [];

    const rundenspiele = await tx.query.termine.findMany({
      where: and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel")),
    });

    const treffer: MoeglichesDuplikat[] = [];
    for (const t of testspiele) {
      const tTag = berlinTag(t.start);
      const tBeschreibung = normalisiereMannschaftsname(t.beschreibung ?? "");

      for (const r of rundenspiele) {
        if (berlinTag(r.start) !== tTag) continue;

        const heim = r.heimMannschaftName
          ? normalisiereMannschaftsname(r.heimMannschaftName)
          : "";
        const auswaerts = r.auswaertsMannschaftName
          ? normalisiereMannschaftsname(r.auswaertsMannschaftName)
          : "";
        const nameTreffer =
          (heim && tBeschreibung.includes(heim)) ||
          (auswaerts && tBeschreibung.includes(auswaerts));
        const zeitTreffer =
          Math.abs(t.start.getTime() - r.start.getTime()) <= ZEITFENSTER_MS;

        if (nameTreffer || zeitTreffer) {
          treffer.push({
            testspielId: t.id,
            testspielStart: t.start,
            testspielBeschreibung: t.beschreibung,
            rundenspielId: r.id,
            rundenspielStart: r.start,
            rundenspielBeschreibung: r.beschreibung,
          });
        }
      }
    }

    return treffer;
  });
}
