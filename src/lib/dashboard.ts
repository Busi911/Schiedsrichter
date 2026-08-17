import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, vereine } from "@/db/schema";
import { bedarfFuer } from "./dienste";
import { brauchtSchiedsrichterVomVerein } from "./besetzung";

// Termine-Spalten + Mannschaftsname/-altersklasse (Jugend/Männer/Frauen) in
// einem Rutsch, statt der reinen termine.findMany() — ohne definierte
// drizzle-Relationen (siehe db/schema.ts) liefert findMany() keine
// verknüpften Tabellen, daher expliziter LEFT JOIN.
function terminMitMannschaft() {
  return {
    id: termine.id,
    typ: termine.typ,
    start: termine.start,
    ort: termine.ort,
    beschreibung: termine.beschreibung,
    pflichtspiel: termine.pflichtspiel,
    freundschaftsTyp: termine.freundschaftsTyp,
    ergebnisHeim: termine.ergebnisHeim,
    ergebnisAuswaerts: termine.ergebnisAuswaerts,
    mannschaftName: mannschaften.name,
    mannschaftAltersklasse: mannschaften.altersklasse,
    // Fallback, wenn kein mannschaftId-Match möglich war (siehe
    // findeMannschaft in rundenspiel-import.ts) — bei rundenspiel-Terminen
    // aus dem nuLiga-Import trägt kategorie z.B. "mJC" oder "Mä/männl.",
    // besser als gar keine Angabe.
    kategorie: termine.kategorie,
  };
}

// Gemeinsame Anzeige-Logik für Mannschaft+Altersklasse, z.B. "Herren 1 (MJC)"
// — Fallback auf termine.kategorie (nuLiga-Rohwert), falls kein mannschaftId-
// Match möglich war (siehe findeMannschaft in rundenspiel-import.ts).
export function formatMannschaft(t: {
  mannschaftName?: string | null;
  mannschaftAltersklasse?: string | null;
  kategorie?: string | null;
}): string | null {
  if (t.mannschaftName) {
    return t.mannschaftAltersklasse
      ? `${t.mannschaftName} (${t.mannschaftAltersklasse})`
      : t.mannschaftName;
  }
  return t.kategorie ?? null;
}

export async function holeNaechsteTermine(vereinId: string, limit = 5) {
  return withTenant(vereinId, (tx) =>
    tx
      .select(terminMitMannschaft())
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(and(eq(termine.vereinId, vereinId), gte(termine.start, new Date())))
      .orderBy(asc(termine.start))
      .limit(limit)
  );
}

// Nur Termine mit eingetragenem Ergebnis (beide Felder gesetzt) — aktuell
// turnier_spiel (manuell) sowie rundenspiel (nuLiga-Import, siehe
// rundenspiel-import.ts) — und in der Vergangenheit, damit hier nicht
// versehentlich ein manuell vorab eingetragenes Ergebnis für ein noch
// bevorstehendes Spiel auftaucht.
export async function holeLetzteErgebnisse(vereinId: string, limit = 20) {
  return withTenant(vereinId, (tx) =>
    tx
      .select(terminMitMannschaft())
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          lt(termine.start, new Date()),
          isNotNull(termine.ergebnisHeim),
          isNotNull(termine.ergebnisAuswaerts)
        )
      )
      .orderBy(desc(termine.start))
      .limit(limit)
  );
}

export type OffenePosten = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  mannschaftLabel: string | null;
  luecken: {
    rolle: "ordner" | "kioskdienst" | "zeitnehmer";
    vorhanden: number;
    bedarf: number;
  }[];
};

type VereinBedarf = Parameters<typeof bedarfFuer>[0];
type AnstehenderTermin = {
  id: string;
  start: Date;
  typ: string;
  ort: string | null;
  pflichtspiel?: boolean | null;
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null;
  mannschaftName?: string | null;
  mannschaftAltersklasse?: string | null;
  kategorie?: string | null;
  zeitnehmerBedarfOverride?: number | null;
};
type Zuordnung = { terminId: string; funktionstraegerTyp: string };

// Nur diese Typen brauchen eine Zeitnehmer-/Sekretär-Zuordnung — deckungsgleich
// mit BESETZUNGSRELEVANTE_TYPEN in den Kalenderansichten (siehe
// src/app/admin/kalender/page.tsx). Der Turnier-Container selbst wird pro
// Einzelspiel (turnier_spiel) besetzt.
const ZEITNEHMER_RELEVANTE_TYPEN = ["spiel_ics", "testspiel", "turnier_spiel", "rundenspiel"];

// Reine Berechnung (ohne DB-Zugriff), damit sie ohne Testdatenbank getestet
// werden kann — siehe src/lib/dashboard.test.ts. Bündelt alle offenen Rollen
// eines Termins (Ordner/Kioskdienst-Bedarf sowie Zeitnehmer/Sekretär) in
// EINEM Eintrag statt separater Zeilen pro Rolle, damit ein einzelner Termin
// mit mehreren offenen Rollen nicht wie mehrere doppelte Termine aussieht.
export function berechneOffenePosten(
  verein: VereinBedarf,
  anstehende: AnstehenderTermin[],
  zuordnungen: Zuordnung[]
): OffenePosten[] {
  const posten: OffenePosten[] = [];

  for (const termin of anstehende) {
    const luecken: OffenePosten["luecken"] = [];

    for (const rolle of ["ordner", "kioskdienst"] as const) {
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        rolle,
        termin.pflichtspiel,
        termin.freundschaftsTyp
      );
      if (bedarf <= 0) continue;
      const vorhanden = zuordnungen.filter(
        (z) => z.terminId === termin.id && z.funktionstraegerTyp === rolle
      ).length;
      if (vorhanden < bedarf) luecken.push({ rolle, vorhanden, bedarf });
    }

    if (ZEITNEHMER_RELEVANTE_TYPEN.includes(termin.typ)) {
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        "zeitnehmer",
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        termin.zeitnehmerBedarfOverride
      );
      const vorhanden = zuordnungen.filter(
        (z) =>
          z.terminId === termin.id &&
          (z.funktionstraegerTyp === "zeitnehmer" || z.funktionstraegerTyp === "sekretaer")
      ).length;
      if (vorhanden < bedarf) luecken.push({ rolle: "zeitnehmer", vorhanden, bedarf });
    }

    if (luecken.length > 0) {
      posten.push({
        terminId: termin.id,
        start: termin.start,
        typ: termin.typ,
        ort: termin.ort,
        mannschaftLabel: formatMannschaft(termin),
        luecken,
      });
    }
  }

  return posten.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeOffenePosten(vereinId: string): Promise<OffenePosten[]> {
  return withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) return [];

    const anstehende = await tx
      .select({
        id: termine.id,
        start: termine.start,
        typ: termine.typ,
        ort: termine.ort,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
        zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, new Date()),
          inArray(termine.typ, [
            "spiel_ics",
            "testspiel",
            "turnier",
            "turnier_spiel",
            "rundenspiel",
          ])
        )
      )
      .orderBy(asc(termine.start));
    if (anstehende.length === 0) return [];

    const terminIds = anstehende.map((t) => t.id);
    const zuordnungen = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
      })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, terminIds));

    return berechneOffenePosten(verein, anstehende, zuordnungen);
  });
}

type AnstehenderSchiriTermin = { id: string; typ: string; pflichtspiel?: boolean | null };

// Reine Berechnung (ohne DB-Zugriff, siehe dashboard.test.ts). Getrennt von
// berechneOffenePosten/holeOffenePosten (Ordner/Kioskdienst/Zeitnehmer, siehe
// /admin/dienste): Schiedsrichter-Zuordnung läuft über die eigene
// Schiedsrichterwart-Rolle, nicht über /admin/dienste — deshalb ein eigener
// Zähler statt eines weiteren luecken-Eintrags in OffenePosten.
export function berechneOffeneSchiedsrichterAnzahl(
  anstehende: AnstehenderSchiriTermin[],
  zuordnungen: { terminId: string; funktionstraegerTyp: string }[]
): number {
  return anstehende
    .filter(brauchtSchiedsrichterVomVerein)
    .filter(
      (t) =>
        !zuordnungen.some(
          (z) => z.terminId === t.id && z.funktionstraegerTyp === "schiedsrichter"
        )
    ).length;
}

export async function holeOffeneSchiedsrichterAnzahl(vereinId: string): Promise<number> {
  return withTenant(vereinId, async (tx) => {
    const anstehende = await tx
      .select({ id: termine.id, typ: termine.typ, pflichtspiel: termine.pflichtspiel })
      .from(termine)
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, new Date()),
          inArray(termine.typ, ["testspiel", "turnier_spiel", "rundenspiel"])
        )
      );
    if (anstehende.length === 0) return 0;

    const terminIds = anstehende.map((t) => t.id);
    const zuordnungen = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
      })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, terminIds));

    return berechneOffeneSchiedsrichterAnzahl(anstehende, zuordnungen);
  });
}

export type OffenerSchiedsrichterTermin = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  mannschaftLabel: string | null;
};

type AnstehenderSchiriTerminMitDetails = AnstehenderSchiriTermin & {
  start: Date;
  ort: string | null;
  mannschaftName?: string | null;
  mannschaftAltersklasse?: string | null;
  kategorie?: string | null;
};

// List-Variante von berechneOffeneSchiedsrichterAnzahl (siehe dort) — statt
// nur der Anzahl liefert diese hier je offenem Termin genug Details für eine
// Erinnerungs-Mail an den Schiedsrichterwart (siehe
// schiedsrichterwart-erinnerung.ts). Reine Berechnung ohne DB-Zugriff, siehe
// dashboard.test.ts.
export function berechneOffeneSchiedsrichterTermine(
  anstehende: AnstehenderSchiriTerminMitDetails[],
  zuordnungen: { terminId: string; funktionstraegerTyp: string }[]
): OffenerSchiedsrichterTermin[] {
  return anstehende
    .filter(brauchtSchiedsrichterVomVerein)
    .filter(
      (t) =>
        !zuordnungen.some(
          (z) => z.terminId === t.id && z.funktionstraegerTyp === "schiedsrichter"
        )
    )
    .map((t) => ({
      terminId: t.id,
      start: t.start,
      typ: t.typ,
      ort: t.ort,
      mannschaftLabel: formatMannschaft(t),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeOffeneSchiedsrichterTermine(
  vereinId: string
): Promise<OffenerSchiedsrichterTermin[]> {
  return withTenant(vereinId, async (tx) => {
    const anstehende = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        pflichtspiel: termine.pflichtspiel,
        start: termine.start,
        ort: termine.ort,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, new Date()),
          inArray(termine.typ, ["testspiel", "turnier_spiel", "rundenspiel"])
        )
      );
    if (anstehende.length === 0) return [];

    const terminIds = anstehende.map((t) => t.id);
    const zuordnungen = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
      })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, terminIds));

    return berechneOffeneSchiedsrichterTermine(anstehende, zuordnungen);
  });
}
