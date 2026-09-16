import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  ignorierteMannschaften,
  mannschaften,
  termine,
  terminZuordnungen,
  vereine,
} from "@/db/schema";
import { bedarfFuer } from "./dienste";
import { ORDNER_ROLLEN } from "./ordnerwart";
import {
  berechneBesetzung,
  brauchtSchiedsrichterVomVerein,
  externeAnsetzungsAnzahlen,
  istBesetzungVollstaendig,
} from "./besetzung";
import { rundenspielTypLabel } from "./termin-label";
import { normalisiereMannschaftsname } from "./rundenspiel-import";

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
    rolle: "ordner" | "kioskdienst" | "kassierer" | "zeitnehmer";
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
  // Roh-Heimname aus dem nuLiga-Import (siehe termine.heimMannschaftName in
  // db/schema.ts) — nur relevant, um gegen IgnorierteMannschaft abzugleichen
  // (siehe istMannschaftIgnoriert unten), wenn keine echte Mannschaft
  // verknüpft ist (mannschaftName leer).
  heimMannschaftName?: string | null;
  zeitnehmerBedarfOverride?: number | null;
  mannschaftOrdnerBedarfDeaktiviert?: boolean | null;
  mannschaftKioskdienstBedarfDeaktiviert?: boolean | null;
  mannschaftKassiererBedarfDeaktiviert?: boolean | null;
  mannschaftZeitnehmerBedarfDeaktiviert?: boolean | null;
  // Vom Verband/Gegner bereits gemeldete Ansetzungen — siehe
  // externeAnsetzungsAnzahlen in besetzung.ts. Ohne diese Felder hielt das
  // Dashboard Termine für unbesetzt, die der Monatskalender längst als
  // vollständig anzeigt.
  handballNetSchiedsrichter?: string | null;
  nuligaSchiedsrichterKuerzel?: string | null;
  handballNetZeitnehmer?: string | null;
};

export type IgnorierteMannschaft = {
  normalisierterName: string;
  kategorie: string | null;
};

// Ein Termin ohne verknüpfte Mannschaft (mannschaftName leer, siehe
// formatMannschaft oben), dessen roher nuLiga-Heimname+Kategorie der Admin
// bereits per "Ablehnen" auf /admin/termine als bewusst nicht anzulegende
// Mannschaft abgelehnt hat (siehe ignorierteMannschaften in db/schema.ts und
// unbekannteMannschaftAblehnen in admin/actions.ts), soll nicht mehr als
// "unbesetzt" auftauchen — der Admin hat sich bereits bewusst dagegen
// entschieden, diese Mannschaft im System zu führen, das Fehlen eines
// Zeitnehmers/Ordners dafür ist dann kein offener Posten mehr. Ist die
// Mannschaft hingegen verknüpft (mannschaftName gesetzt), greift stattdessen
// die reguläre Bedarf-Deaktivierung pro Mannschaft (siehe
// mannschaftBedarfDeaktiviertFuer in dienste.ts) — dieser Check hier bleibt
// dann folgenlos, ein zufälliger Namens-Treffer soll eine ECHTE Mannschaft
// nie fälschlich ausblenden.
export function istMannschaftIgnoriert(
  termin: Pick<AnstehenderTermin, "mannschaftName" | "heimMannschaftName" | "kategorie">,
  ignorierteMannschaften: IgnorierteMannschaft[]
): boolean {
  if (termin.mannschaftName || !termin.heimMannschaftName) return false;
  const heimNorm = normalisiereMannschaftsname(termin.heimMannschaftName);
  return ignorierteMannschaften.some(
    (m) => m.normalisierterName === heimNorm && m.kategorie === (termin.kategorie ?? null)
  );
}

// Wählt aus den geflachten mannschaftXyzBedarfDeaktiviert-Feldern eines
// AnstehenderTermin das zur Rolle passende aus — Pendant zu
// mannschaftBedarfDeaktiviertFuer in dienste.ts, das ein verschachteltes
// Mannschafts-Objekt statt geflachter Termin-Felder erwartet.
function mannschaftDeaktiviertFuerOrdnerRolle(
  termin: AnstehenderTermin,
  rolle: (typeof ORDNER_ROLLEN)[number]
): boolean | null | undefined {
  if (rolle === "ordner") return termin.mannschaftOrdnerBedarfDeaktiviert;
  if (rolle === "kioskdienst") return termin.mannschaftKioskdienstBedarfDeaktiviert;
  return termin.mannschaftKassiererBedarfDeaktiviert;
}
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
  zuordnungen: Zuordnung[],
  ignorierteMannschaften: IgnorierteMannschaft[] = []
): UnbesetzterTermin[] {
  const ergebnis: UnbesetzterTermin[] = [];

  for (const termin of anstehende) {
    if (!(UNBESETZTE_TERMINE_TYPEN as readonly string[]).includes(termin.typ)) continue;
    if (istMannschaftIgnoriert(termin, ignorierteMannschaften)) continue;

    const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === termin.id);
    const { externeSchiriAnzahl, externeZeitnehmerSekretaerAnzahl } =
      externeAnsetzungsAnzahlen(termin, eigeneZuordnungen);
    const status = berechneBesetzung(
      eigeneZuordnungen,
      false,
      bedarfFuer(
        verein,
        termin.typ,
        "zeitnehmer",
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        termin.zeitnehmerBedarfOverride,
        termin.mannschaftZeitnehmerBedarfDeaktiviert
      ),
      externeSchiriAnzahl,
      externeZeitnehmerSekretaerAnzahl
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

// Gemeinsam von holeUnbesetzteTermine und holeOffenePosten genutzt — siehe
// istMannschaftIgnoriert oben.
function holeIgnorierteMannschaften(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  vereinId: string
) {
  return tx
    .select({
      normalisierterName: ignorierteMannschaften.normalisierterName,
      kategorie: ignorierteMannschaften.kategorie,
    })
    .from(ignorierteMannschaften)
    .where(eq(ignorierteMannschaften.vereinId, vereinId));
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
        heimMannschaftName: termine.heimMannschaftName,
        zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
        mannschaftOrdnerBedarfDeaktiviert: mannschaften.ordnerBedarfDeaktiviert,
        mannschaftKioskdienstBedarfDeaktiviert: mannschaften.kioskdienstBedarfDeaktiviert,
        mannschaftZeitnehmerBedarfDeaktiviert: mannschaften.zeitnehmerBedarfDeaktiviert,
        handballNetSchiedsrichter: termine.handballNetSchiedsrichter,
        nuligaSchiedsrichterKuerzel: termine.nuligaSchiedsrichterKuerzel,
        handballNetZeitnehmer: termine.handballNetZeitnehmer,
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
    const [zuordnungen, ignoriert] = await Promise.all([
      tx
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        })
        .from(terminZuordnungen)
        .where(inArray(terminZuordnungen.terminId, terminIds)),
      holeIgnorierteMannschaften(tx, vereinId),
    ]);

    return berechneUnbesetzteTermine(verein, anstehende, zuordnungen, ignoriert).slice(0, limit);
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
  zuordnungen: Zuordnung[],
  ignorierteMannschaften: IgnorierteMannschaft[] = []
): OffenePosten[] {
  const posten: OffenePosten[] = [];

  for (const termin of anstehende) {
    if (istMannschaftIgnoriert(termin, ignorierteMannschaften)) continue;
    const luecken: OffenePosten["luecken"] = [];

    for (const rolle of ORDNER_ROLLEN) {
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        rolle,
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        undefined,
        mannschaftDeaktiviertFuerOrdnerRolle(termin, rolle)
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
        termin.zeitnehmerBedarfOverride,
        termin.mannschaftZeitnehmerBedarfDeaktiviert
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
        heimMannschaftName: termine.heimMannschaftName,
        zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
        mannschaftOrdnerBedarfDeaktiviert: mannschaften.ordnerBedarfDeaktiviert,
        mannschaftKioskdienstBedarfDeaktiviert: mannschaften.kioskdienstBedarfDeaktiviert,
        mannschaftKassiererBedarfDeaktiviert: mannschaften.kassiererBedarfDeaktiviert,
        mannschaftZeitnehmerBedarfDeaktiviert: mannschaften.zeitnehmerBedarfDeaktiviert,
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
    const [zuordnungen, ignoriert] = await Promise.all([
      tx
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        })
        .from(terminZuordnungen)
        .where(inArray(terminZuordnungen.terminId, terminIds)),
      holeIgnorierteMannschaften(tx, vereinId),
    ]);

    return berechneOffenePosten(verein, anstehende, zuordnungen, ignoriert);
  });
}

type AnstehenderSchiriTermin = {
  id: string;
  typ: string;
  pflichtspiel?: boolean | null;
  // Für istMannschaftIgnoriert und externeAnsetzungsAnzahlen — beides galt
  // hier früher nicht, sodass Badge und Wart-Erinnerung Termine als offen
  // meldeten, die der Kalender als besetzt bzw. bewusst ignoriert führt.
  mannschaftName?: string | null;
  heimMannschaftName?: string | null;
  kategorie?: string | null;
  handballNetSchiedsrichter?: string | null;
  nuligaSchiedsrichterKuerzel?: string | null;
};

// Ein Schiedsrichter-Posten gilt als offen, wenn weder eine eigene Zuordnung
// noch eine Verbands-/Gegner-Ansetzung existiert. Gemeinsam genutzt von der
// Badge-Zählung und der Schiedsrichterwart-Erinnerung, damit beide dieselbe
// Termin-Menge sehen.
function istSchiedsrichterPostenOffen(
  termin: AnstehenderSchiriTermin,
  zuordnungen: { terminId: string; funktionstraegerTyp: string }[],
  ignorierteMannschaften: IgnorierteMannschaft[]
): boolean {
  if (!brauchtSchiedsrichterVomVerein(termin)) return false;
  if (istMannschaftIgnoriert(termin, ignorierteMannschaften)) return false;
  const eigene = zuordnungen.filter((z) => z.terminId === termin.id);
  const { externeSchiriAnzahl } = externeAnsetzungsAnzahlen(termin, eigene);
  if (externeSchiriAnzahl > 0) return false;
  return !eigene.some((z) => z.funktionstraegerTyp === "schiedsrichter");
}

// Reine Berechnung (ohne DB-Zugriff, siehe dashboard.test.ts). Getrennt von
// berechneOffenePosten/holeOffenePosten (Ordner/Kioskdienst/Zeitnehmer, siehe
// /admin/dienste): Schiedsrichter-Zuordnung läuft über die eigene
// Schiedsrichterwart-Rolle, nicht über /admin/dienste — deshalb ein eigener
// Zähler statt eines weiteren luecken-Eintrags in OffenePosten.
export function berechneOffeneSchiedsrichterAnzahl(
  anstehende: AnstehenderSchiriTermin[],
  zuordnungen: { terminId: string; funktionstraegerTyp: string }[],
  ignorierteMannschaften: IgnorierteMannschaft[] = []
): number {
  return anstehende.filter((t) =>
    istSchiedsrichterPostenOffen(t, zuordnungen, ignorierteMannschaften)
  ).length;
}

export async function holeOffeneSchiedsrichterAnzahl(vereinId: string): Promise<number> {
  return withTenant(vereinId, async (tx) => {
    const anstehende = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        pflichtspiel: termine.pflichtspiel,
        mannschaftName: mannschaften.name,
        heimMannschaftName: termine.heimMannschaftName,
        kategorie: termine.kategorie,
        handballNetSchiedsrichter: termine.handballNetSchiedsrichter,
        nuligaSchiedsrichterKuerzel: termine.nuligaSchiedsrichterKuerzel,
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
    if (anstehende.length === 0) return 0;

    const terminIds = anstehende.map((t) => t.id);
    const [zuordnungen, ignoriert] = await Promise.all([
      tx
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        })
        .from(terminZuordnungen)
        .where(inArray(terminZuordnungen.terminId, terminIds)),
      holeIgnorierteMannschaften(tx, vereinId),
    ]);

    return berechneOffeneSchiedsrichterAnzahl(anstehende, zuordnungen, ignoriert);
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
  zuordnungen: { terminId: string; funktionstraegerTyp: string }[],
  ignorierteMannschaften: IgnorierteMannschaft[] = []
): OffenerSchiedsrichterTermin[] {
  return anstehende
    .filter((t) => istSchiedsrichterPostenOffen(t, zuordnungen, ignorierteMannschaften))
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
        heimMannschaftName: termine.heimMannschaftName,
        handballNetSchiedsrichter: termine.handballNetSchiedsrichter,
        nuligaSchiedsrichterKuerzel: termine.nuligaSchiedsrichterKuerzel,
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
    const [zuordnungen, ignoriert] = await Promise.all([
      tx
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        })
        .from(terminZuordnungen)
        .where(inArray(terminZuordnungen.terminId, terminIds)),
      holeIgnorierteMannschaften(tx, vereinId),
    ]);

    return berechneOffeneSchiedsrichterTermine(anstehende, zuordnungen, ignoriert);
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
  zuordnungen: Zuordnung[],
  ignorierteMannschaften: IgnorierteMannschaft[] = []
): OffenerZeitnehmerTermin[] {
  const posten: OffenerZeitnehmerTermin[] = [];

  for (const termin of anstehende) {
    if (!(ZEITNEHMER_RELEVANTE_TYPEN as readonly string[]).includes(termin.typ)) continue;
    if (istMannschaftIgnoriert(termin, ignorierteMannschaften)) continue;

    const bedarf = bedarfFuer(
      verein,
      termin.typ,
      "zeitnehmer",
      termin.pflichtspiel,
      termin.freundschaftsTyp,
      termin.zeitnehmerBedarfOverride,
      termin.mannschaftZeitnehmerBedarfDeaktiviert
    );
    if (bedarf <= 0) continue;

    const eigene = zuordnungen.filter((z) => z.terminId === termin.id);
    const { externeZeitnehmerSekretaerAnzahl } = externeAnsetzungsAnzahlen(
      termin,
      eigene
    );
    const vorhanden =
      eigene.filter(
        (z) =>
          z.funktionstraegerTyp === "zeitnehmer" ||
          z.funktionstraegerTyp === "sekretaer"
      ).length + externeZeitnehmerSekretaerAnzahl;
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
        mannschaftZeitnehmerBedarfDeaktiviert: mannschaften.zeitnehmerBedarfDeaktiviert,
        heimMannschaftName: termine.heimMannschaftName,
        handballNetZeitnehmer: termine.handballNetZeitnehmer,
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
    const [zuordnungen, ignoriert] = await Promise.all([
      tx
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        })
        .from(terminZuordnungen)
        .where(inArray(terminZuordnungen.terminId, terminIds)),
      holeIgnorierteMannschaften(tx, vereinId),
    ]);

    return berechneOffeneZeitnehmerTermine(verein, anstehende, zuordnungen, ignoriert);
  });
}
