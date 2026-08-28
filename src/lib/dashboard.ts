import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, vereine } from "@/db/schema";
import { bedarfFuer } from "./dienste";
import {
  berechneBesetzung,
  brauchtSchiedsrichterVomVerein,
  istBesetzungVollstaendig,
} from "./besetzung";
import { rundenspielTypLabel } from "./termin-label";

const OFFENE_POSTEN_TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
};

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
  typLabel: string;
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
const ZEITNEHMER_RELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
] as const;

export type UnbesetzterTermin = {
  terminId: string;
  start: Date;
  typ: string;
  typLabel: string;
  ort: string | null;
  mannschaftLabel: string | null;
  schiriOffen: boolean;
  zeitnehmerOffen: boolean;
};

// spiel_ics bewusst ausgenommen — rein persönlicher ICS-Feed-Einsatz eines
// Schiedsrichters (oft bei fremden Vereinen), kein Vereins-Termin. Dieselbe
// Ausnahme wie im Admin-Kalender, siehe holeAdminKalenderDaten in
// admin-kalender.ts.
const UNBESETZTE_TERMINE_TYPEN = ["testspiel", "turnier_spiel", "rundenspiel"] as const;

// Reine Berechnung (ohne DB-Zugriff, siehe dashboard.test.ts) für die
// "Unbesetzte Termine"-Karte im Dashboard: nutzt dieselbe
// Besetzungsvollständigkeits-Logik wie der Monatskalender (siehe
// istBesetzungVollstaendig/berechneBesetzung in besetzung.ts sowie
// holeAdminKalenderDaten in admin-kalender.ts) — Schiedsrichter UND
// Zeitnehmer/Sekretär, NICHT Ordner/Kioskdienst (das sind reine
// Helferdienste, siehe berechneOffenePosten unten für /admin/dienste).
export function berechneUnbesetzteTermine(
  verein: VereinBedarf,
  anstehende: AnstehenderTermin[],
  zuordnungen: Zuordnung[]
): UnbesetzterTermin[] {
  const ergebnis: UnbesetzterTermin[] = [];

  for (const termin of anstehende) {
    if (!(UNBESETZTE_TERMINE_TYPEN as readonly string[]).includes(termin.typ)) continue;

    const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === termin.id);
    const status = berechneBesetzung(
      eigeneZuordnungen,
      false,
      bedarfFuer(
        verein,
        termin.typ,
        "zeitnehmer",
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        termin.zeitnehmerBedarfOverride
      )
    );
    if (istBesetzungVollstaendig(status, termin.typ, termin.pflichtspiel)) continue;

    ergebnis.push({
      terminId: termin.id,
      start: termin.start,
      typ: termin.typ,
      typLabel:
        termin.typ === "rundenspiel"
          ? rundenspielTypLabel(termin.pflichtspiel, termin.freundschaftsTyp)
          : (OFFENE_POSTEN_TYP_LABEL[termin.typ] ?? termin.typ),
      ort: termin.ort,
      mannschaftLabel: formatMannschaft(termin),
      // Bei echten Ligaspielen (pflichtspiel = true) stellt der Verband den
      // Schiedsrichter — siehe istBesetzungVollstaendig — daher hier nie als
      // offen ausgewiesen.
      schiriOffen: !(termin.typ === "rundenspiel" && termin.pflichtspiel === true)
        && !status.schiriErfuellt,
      zeitnehmerOffen: !status.zeitnehmerSekretaerErfuellt,
    });
  }

  return ergebnis.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeUnbesetzteTermine(
  vereinId: string,
  limit = 10
): Promise<UnbesetzterTermin[]> {
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
          inArray(termine.typ, UNBESETZTE_TERMINE_TYPEN)
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

    return berechneUnbesetzteTermine(verein, anstehende, zuordnungen).slice(0, limit);
  });
}

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

    if ((ZEITNEHMER_RELEVANTE_TYPEN as readonly string[]).includes(termin.typ)) {
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
        typLabel:
          termin.typ === "rundenspiel"
            ? rundenspielTypLabel(termin.pflichtspiel, termin.freundschaftsTyp)
            : (OFFENE_POSTEN_TYP_LABEL[termin.typ] ?? termin.typ),
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

export type OffenerZeitnehmerTermin = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  mannschaftLabel: string | null;
  vorhanden: number;
  bedarf: number;
};

// List-Variante analog zu berechneOffeneSchiedsrichterTermine, aber für den
// Zeitnehmer-/Sekretär-Bedarf (siehe zeitnehmerwart-erinnerung.ts). Bewusst
// getrennt von berechneOffenePosten/holeOffenePosten (das bündelt Ordner/
// Kioskdienst UND Zeitnehmer in einem Eintrag für /admin/dienste, Empfänger
// dort: alle Admins) — diese Liste geht gezielt an die Zeitnehmerwart-Rolle,
// analog zum Schiedsrichter-Pendant oben. Reine Berechnung ohne DB-Zugriff,
// siehe dashboard.test.ts.
export function berechneOffeneZeitnehmerTermine(
  verein: VereinBedarf,
  anstehende: AnstehenderTermin[],
  zuordnungen: Zuordnung[]
): OffenerZeitnehmerTermin[] {
  const posten: OffenerZeitnehmerTermin[] = [];

  for (const termin of anstehende) {
    if (!(ZEITNEHMER_RELEVANTE_TYPEN as readonly string[]).includes(termin.typ)) continue;

    const bedarf = bedarfFuer(
      verein,
      termin.typ,
      "zeitnehmer",
      termin.pflichtspiel,
      termin.freundschaftsTyp,
      termin.zeitnehmerBedarfOverride
    );
    if (bedarf <= 0) continue;

    const vorhanden = zuordnungen.filter(
      (z) =>
        z.terminId === termin.id &&
        (z.funktionstraegerTyp === "zeitnehmer" || z.funktionstraegerTyp === "sekretaer")
    ).length;
    if (vorhanden >= bedarf) continue;

    posten.push({
      terminId: termin.id,
      start: termin.start,
      typ: termin.typ,
      ort: termin.ort,
      mannschaftLabel: formatMannschaft(termin),
      vorhanden,
      bedarf,
    });
  }

  return posten.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeOffeneZeitnehmerTermine(
  vereinId: string
): Promise<OffenerZeitnehmerTermin[]> {
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
          inArray(termine.typ, ZEITNEHMER_RELEVANTE_TYPEN)
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

    return berechneOffeneZeitnehmerTermine(verein, anstehende, zuordnungen);
  });
}
