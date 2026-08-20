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

// Admins legen Freundschaftsspiele/Turnier-Einzelspiele oft manuell an, bevor
// der Verband/nuLiga das Spiel offiziell führt (z.B. weil noch kein
// Schiedsrichter feststeht) — erscheint das Spiel später über den
// automatischen nuLiga-Sync als "rundenspiel", existieren beide Termine
// parallel und doppeln sich im Kalender. Absichtlich nur eine Vorschlagsliste
// zum manuellen Aufräumen (kein Auto-Löschen): weder Team-Name-Substring-
// Match noch Zeitnähe sind zuverlässig genug, um blind einen Termin zu
// löschen.
//
// Bewusst eng (statt z.B. 4h): an einem vollen Turniertag laufen an
// derselben Halle viele fremde Spiele im Stundentakt — ein großzügiges
// Zeitfenster würde dort praktisch jedes Turnier-Einzelspiel mit jedem
// Hallenspielplan-Eintrag des Tages "matchen", nicht nur die tatsächlich
// identische Begegnung. 30 Minuten deckt weiterhin die übliche Ungenauigkeit
// ab (Admin trägt die Uhrzeit beim manuellen Anlegen nur überschlägig ein),
// verlässt sich bei größerer Abweichung aber auf den Namens-Treffer statt
// auf Zeitnähe allein.
const ZEITFENSTER_MS = 30 * 60 * 1000;

function berlinTag(d: Date): string {
  return d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

export type MoeglichesDuplikat = {
  quellId: string;
  quellTyp: "testspiel" | "turnier_spiel";
  quellStart: Date;
  quellBeschreibung: string | null;
  quellBesetzung: string[];
  // Nur bei quellTyp = "turnier_spiel" gesetzt: der Turnier-Container, zu dem
  // das Spiel gehört — wird beim Verknüpfen auf das Rundenspiel übertragen
  // (siehe spielDuplikatVerknuepfen in admin/actions.ts), damit es weiterhin
  // im Turnier-Spielplan bzw. auf der öffentlichen Turnier-Seite erscheint.
  quellTurnierId: string | null;
  // Für die automatische Mail-Benachrichtigung (siehe
  // duplikat-benachrichtigung.ts) — nicht für die Anzeige auf /admin/termine
  // gedacht. null = kein Ersteller bekannt (z.B. gelöschter Account), dann
  // bleibt der Fund nur in dieser Liste sichtbar, ohne Mail.
  quellErstelltVon: string | null;
  quellDuplikatGemeldetAm: Date | null;
  rundenspielId: string;
  rundenspielStart: Date;
  rundenspielBeschreibung: string | null;
  rundenspielBesetzung: string[];
};

// Ein spiel_ics-Termin (persönlicher ICS-Feed-Einsatz eines Schiedsrichters)
// dubliert sich mit einem manuell angelegten Freundschaftsspiel/Turnier-
// Einzelspiel, wenn der Schiedsrichter zufällig genau das Spiel des eigenen
// Vereins offiziell zugewiesen bekommt. Bewusst ein eigener Typ statt
// Erweiterung von MoeglichesDuplikat: hier gibt es (anders als beim
// Rundenspiel-Fall oben) keinen "Verknüpfen"-Button — spiel_ics-Zeilen
// werden bei jedem ICS-Sync anhand der UID neu geschrieben bzw. gelöscht
// (siehe ics-sync.ts), ein automatischer Merge könnte dadurch später
// unbemerkt wieder auseinanderfallen. Admins sehen den Fund hier nur zur
// Info und räumen bei Bedarf manuell auf.
export type MoeglichesIcsDuplikat = {
  quellId: string;
  quellTyp: "testspiel" | "turnier_spiel";
  quellStart: Date;
  quellBeschreibung: string | null;
  quellBesetzung: string[];
  quellErstelltVon: string | null;
  quellDuplikatGemeldetAm: Date | null;
  icsId: string;
  icsStart: Date;
  icsBeschreibung: string | null;
  icsBesetzung: string[];
};

type DuplikatKandidat = {
  id: string;
  typ: "testspiel" | "turnier_spiel";
  start: Date;
  beschreibung: string | null;
  besetzung: string[];
  turnierId: string | null;
  erstelltVon?: string | null;
  duplikatGemeldetAm?: Date | null;
};
type RundenspielKandidat = {
  id: string;
  start: Date;
  beschreibung: string | null;
  besetzung: string[];
  heimMannschaftName: string | null;
  auswaertsMannschaftName: string | null;
};
type IcsKandidat = {
  id: string;
  start: Date;
  beschreibung: string | null;
  besetzung: string[];
};

// Reine Matching-Logik (ohne DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe duplikat-erkennung.test.ts. Ein manuell
// angelegtes Spiel (Freundschaftsspiel oder Turnier-Einzelspiel) und ein
// Rundenspiel gelten als mögliches Duplikat, wenn sie am selben Tag
// (Berlin-Ortszeit) liegen UND entweder der Team-Name im Beschreibungstext
// vorkommt ODER die Startzeiten innerhalb von ZEITFENSTER_MS liegen.
export function findeDuplikatPaare(
  quellen: DuplikatKandidat[],
  rundenspiele: RundenspielKandidat[]
): MoeglichesDuplikat[] {
  const treffer: MoeglichesDuplikat[] = [];
  for (const q of quellen) {
    const qTag = berlinTag(q.start);
    const qBeschreibung = normalisiereMannschaftsname(q.beschreibung ?? "");

    for (const r of rundenspiele) {
      if (berlinTag(r.start) !== qTag) continue;

      const heim = r.heimMannschaftName
        ? normalisiereMannschaftsname(r.heimMannschaftName)
        : "";
      const auswaerts = r.auswaertsMannschaftName
        ? normalisiereMannschaftsname(r.auswaertsMannschaftName)
        : "";
      const nameTreffer =
        (heim && qBeschreibung.includes(heim)) ||
        (auswaerts && qBeschreibung.includes(auswaerts));
      const zeitTreffer =
        Math.abs(q.start.getTime() - r.start.getTime()) <= ZEITFENSTER_MS;

      if (nameTreffer || zeitTreffer) {
        treffer.push({
          quellId: q.id,
          quellTyp: q.typ,
          quellStart: q.start,
          quellBeschreibung: q.beschreibung,
          quellBesetzung: q.besetzung,
          quellTurnierId: q.turnierId,
          quellErstelltVon: q.erstelltVon ?? null,
          quellDuplikatGemeldetAm: q.duplikatGemeldetAm ?? null,
          rundenspielId: r.id,
          rundenspielStart: r.start,
          rundenspielBeschreibung: r.beschreibung,
          rundenspielBesetzung: r.besetzung,
        });
      }
    }
  }
  return treffer;
}

// Analog zu findeDuplikatPaare, aber gegen spiel_ics-Termine (persönliche
// ICS-Feed-Einsätze eines Schiedsrichters) statt Rundenspiele. Ohne
// strukturierte Heim-/Auswärts-Spalten (die hat nur der nuLiga-Import) bleibt
// hier nur die Zeitnähe als Signal — bewusst weiterhin dasselbe enge
// ZEITFENSTER_MS wie oben, aus demselben Grund (dicht getaktete Turniertage).
export function findeIcsDuplikatPaare(
  quellen: DuplikatKandidat[],
  icsTermine: IcsKandidat[]
): MoeglichesIcsDuplikat[] {
  const treffer: MoeglichesIcsDuplikat[] = [];
  for (const q of quellen) {
    const qTag = berlinTag(q.start);

    for (const ics of icsTermine) {
      if (berlinTag(ics.start) !== qTag) continue;
      if (Math.abs(q.start.getTime() - ics.start.getTime()) > ZEITFENSTER_MS) continue;

      treffer.push({
        quellId: q.id,
        quellTyp: q.typ,
        quellStart: q.start,
        quellBeschreibung: q.beschreibung,
        quellBesetzung: q.besetzung,
        quellErstelltVon: q.erstelltVon ?? null,
        quellDuplikatGemeldetAm: q.duplikatGemeldetAm ?? null,
        icsId: ics.id,
        icsStart: ics.start,
        icsBeschreibung: ics.beschreibung,
        icsBesetzung: ics.besetzung,
      });
    }
  }
  return treffer;
}

export type SpielDuplikate = {
  rundenspielDuplikate: MoeglichesDuplikat[];
  icsDuplikate: MoeglichesIcsDuplikat[];
};

export async function findeSpielDuplikate(vereinId: string): Promise<SpielDuplikate> {
  return withTenant(vereinId, async (tx) => {
    const quellen = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        inArray(termine.typ, ["testspiel", "turnier_spiel"]),
        eq(termine.quelle, "manuell")
      ),
    });
    if (quellen.length === 0) return { rundenspielDuplikate: [], icsDuplikate: [] };

    const [rundenspiele, icsTermine] = await Promise.all([
      tx.query.termine.findMany({
        where: and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel")),
      }),
      tx.query.termine.findMany({
        where: and(eq(termine.vereinId, vereinId), eq(termine.typ, "spiel_ics")),
      }),
    ]);

    const alleTerminIds = [
      ...quellen.map((q) => q.id),
      ...rundenspiele.map((r) => r.id),
      ...icsTermine.map((i) => i.id),
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

    const quellKandidaten = quellen.map((q) => ({
      id: q.id,
      typ: q.typ as "testspiel" | "turnier_spiel",
      start: q.start,
      beschreibung: q.beschreibung,
      turnierId: q.turnierId,
      erstelltVon: q.erstelltVon,
      duplikatGemeldetAm: q.duplikatGemeldetAm,
      besetzung: besetzungFuer(q.id),
    }));

    return {
      rundenspielDuplikate: findeDuplikatPaare(
        quellKandidaten,
        rundenspiele.map((r) => ({
          id: r.id,
          start: r.start,
          beschreibung: r.beschreibung,
          heimMannschaftName: r.heimMannschaftName,
          auswaertsMannschaftName: r.auswaertsMannschaftName,
          besetzung: besetzungFuer(r.id),
        }))
      ),
      icsDuplikate: findeIcsDuplikatPaare(
        quellKandidaten,
        icsTermine.map((i) => ({
          id: i.id,
          start: i.start,
          beschreibung: i.beschreibung,
          besetzung: besetzungFuer(i.id),
        }))
      ),
    };
  });
}
