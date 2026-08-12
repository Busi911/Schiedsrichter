import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users } from "@/db/schema";
import { normalisiereMannschaftsname } from "./rundenspiel-import";

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

// Admins legen Freundschaftsspiele oft manuell an, bevor der Verband/nuLiga das
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
  testspielBesetzung: string[];
  rundenspielId: string;
  rundenspielStart: Date;
  rundenspielBeschreibung: string | null;
  rundenspielBesetzung: string[];
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

    const alleTerminIds = [
      ...testspiele.map((t) => t.id),
      ...rundenspiele.map((r) => r.id),
    ];
    const zuordnungen = alleTerminIds.length
      ? await tx
          .select({
            terminId: terminZuordnungen.terminId,
            funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
            name: users.name,
            email: users.email,
            externerName: terminZuordnungen.externerName,
          })
          .from(terminZuordnungen)
          .leftJoin(users, eq(terminZuordnungen.userId, users.id))
          .where(inArray(terminZuordnungen.terminId, alleTerminIds))
      : [];

    function besetzungFuer(terminId: string): string[] {
      return zuordnungen
        .filter((z) => z.terminId === terminId)
        .map(
          (z) =>
            `${ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${
              z.name ?? z.externerName ?? z.email
            }`
        );
    }

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
            testspielBesetzung: besetzungFuer(t.id),
            rundenspielId: r.id,
            rundenspielStart: r.start,
            rundenspielBeschreibung: r.beschreibung,
            rundenspielBesetzung: besetzungFuer(r.id),
          });
        }
      }
    }

    return treffer;
  });
}
