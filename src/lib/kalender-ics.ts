import "server-only";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
} from "@/db/schema";
import { formatMannschaft } from "@/lib/dashboard";
import { rundenspielTypLabel } from "@/lib/termin-label";
import { appUrl } from "@/lib/app-url";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  trainer: "Trainer",
};

// Fenster für den Kalender-Abo-Feed: nicht die komplette Historie (würde mit
// den Jahren nur immer weiter wachsen), aber genug Rückblick/Vorlauf, dass
// ein periodischer Abgleich durch eine Kalender-App nichts Relevantes
// verpasst.
const VERGANGENHEIT_TAGE = 30;
const ZUKUNFT_TAGE = 400;

// Ohne erfasstes Ende (termine.ende ist optional) eine Dauer anzunehmen ist
// besser als DTSTART=DTEND (von manchen Kalender-Apps als Ganztags-Termin
// missverstanden) — 2 Stunden ist eine übliche Dauer für Handballspiele/
// -dienste.
const STANDARD_DAUER_MS = 2 * 60 * 60 * 1000;

export type IcsTermin = {
  id: string;
  start: Date;
  ende: Date | null;
  ort: string | null;
  titel: string;
};

// Rohdaten für den ICS-Export, analog zu holeEigeneKalenderEintraege in
// eigener-kalender.ts (dieselben "wobei ist die Person beteiligt"-
// Bedingungen: Schiedsrichter via ICS-Feed, Zeitnehmer/Sekretär/Ordner/
// Kioskdienst via Zuordnung, Trainer via eigene Mannschaft) — hier aber roh
// mit echten Date-Objekten statt der für die Monats-Grid-Anzeige bereits
// formatierten Werte, und über ein Zeitfenster statt einen einzelnen Monat.
export async function holeEigeneTermineFuerIcsExport(
  vereinId: string,
  userId: string
): Promise<IcsTermin[]> {
  const jetzt = new Date();
  const von = new Date(jetzt.getTime() - VERGANGENHEIT_TAGE * 24 * 60 * 60 * 1000);
  const bis = new Date(jetzt.getTime() + ZUKUNFT_TAGE * 24 * 60 * 60 * 1000);

  return withTenant(vereinId, async (tx) => {
    const eigeneRollen = await tx.query.funktionstraegerRollen.findMany({
      where: eq(funktionstraegerRollen.userId, userId),
    });
    const mannschaftIds = eigeneRollen
      .filter((r) => r.typ === "trainer" && r.mannschaftId)
      .map((r) => r.mannschaftId!);

    const eigeneZuordnungen = await tx.query.terminZuordnungen.findMany({
      where: eq(terminZuordnungen.userId, userId),
    });
    const zugeordneteTerminIds = eigeneZuordnungen.map((z) => z.terminId);

    const bedingungen = [eq(termine.icsSchiedsrichterId, userId)];
    if (zugeordneteTerminIds.length) {
      bedingungen.push(inArray(termine.id, zugeordneteTerminIds));
    }
    if (mannschaftIds.length) {
      bedingungen.push(inArray(termine.mannschaftId, mannschaftIds));
    }

    const rohTermine = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ende: termine.ende,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        hatIcsSchiedsrichter: termine.icsSchiedsrichterId,
        mannschaftId: termine.mannschaftId,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, von),
          lte(termine.start, bis),
          or(...bedingungen)
        )
      )
      .orderBy(asc(termine.start));

    return rohTermine.map((t) => {
      const meineRollen = new Set<string>();
      if (t.hatIcsSchiedsrichter === userId) meineRollen.add("schiedsrichter");
      for (const z of eigeneZuordnungen) {
        if (z.terminId === t.id) meineRollen.add(z.funktionstraegerTyp);
      }
      if (t.mannschaftId && mannschaftIds.includes(t.mannschaftId)) {
        meineRollen.add("trainer");
      }
      const rollenLabel = [...meineRollen]
        .map((r) => ROLLE_LABEL[r] ?? r)
        .join("/");
      const typLabel =
        t.typ === "rundenspiel"
          ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
          : (TYP_LABEL[t.typ] ?? t.typ);
      const mannschaftLabel = formatMannschaft(t);
      const beschreibung = [typLabel, mannschaftLabel ?? t.beschreibung]
        .filter(Boolean)
        .join(" ");
      return {
        id: t.id,
        start: t.start,
        ende: t.ende,
        ort: t.ort,
        titel: rollenLabel ? `${rollenLabel}: ${beschreibung}` : beschreibung,
      };
    });
  });
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDatum(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545 verlangt einen Zeilenumbruch nach spätestens 75 Oktetten
// (Fortsetzungszeile beginnt mit einem Leerzeichen) — ohne dieses Folding
// lehnen manche Kalender-Clients (u.a. ältere Outlook-Versionen) sehr lange
// Zeilen ab. Reicht hier mit String-Länge statt echter Oktett-Zählung, da
// Umlaute/Sonderzeichen in Feldern wie Ort/Titel selten genug vorkommen, um
// die paar Oktette Unterschied nicht relevant zu machen.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let ergebnis = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    ergebnis += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return ergebnis;
}

// Minimales, von Hand gebautes VCALENDAR statt einer zusätzlichen
// Dependency — der Funktionsumfang (ein SUMMARY/LOCATION/DTSTART/DTEND pro
// Termin, keine Wiederholungsregeln) ist klein genug, dass sich eine
// Bibliothek dafür nicht lohnt (node-ical im Projekt kann nur lesen, nicht
// schreiben).
export function generiereIcsFeed(vereinName: string, termine: IcsTermin[]): string {
  const uidHost = new URL(appUrl()).hostname;
  const jetzt = icsDatum(new Date());

  const zeilen: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HandballerPate//Kalender//DE",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`${vereinName} – Meine Termine`)}`,
  ];

  for (const t of termine) {
    const ende = t.ende ?? new Date(t.start.getTime() + STANDARD_DAUER_MS);
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@${uidHost}`,
      `DTSTAMP:${jetzt}`,
      `DTSTART:${icsDatum(t.start)}`,
      `DTEND:${icsDatum(ende)}`,
      `SUMMARY:${escapeIcsText(t.titel)}`
    );
    if (t.ort) zeilen.push(`LOCATION:${escapeIcsText(t.ort)}`);
    zeilen.push("END:VEVENT");
  }

  zeilen.push("END:VCALENDAR");
  return zeilen.map(foldLine).join("\r\n") + "\r\n";
}
