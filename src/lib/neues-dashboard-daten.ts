import "server-only";
import { and, asc, count, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { withTenant } from "@/db";
import { beitrittAntraege, mannschaften, mitglieder, termine } from "@/db/schema";
import { holeUnbesetzteTermine } from "./dashboard";
import { formatMannschaft } from "./mannschaft-label";
import {
  baueAufgaben,
  baueHero,
  spielTitel,
  tagesGrenzen,
  type Aufgabe,
  type Besetzungsstand,
  type Hero,
  type SpielHeute,
} from "./neues-dashboard";

// Spiele, die der Verein auf dem Start-Bildschirm sehen will (ohne Turnier-Container und ICS-Einsätze): Ligaspiele, Freundschaftsspiele, Turnierspiele, Auswärtsspiele.
const SPIEL_TYPEN = ["rundenspiel", "testspiel", "turnier_spiel", "auswaertsspiel"] as const;

const SIEBEN_TAGE_MS = 7 * 24 * 60 * 60 * 1000;

export type NeuesDashboardDaten = {
  hero: Hero;
  /** Nächster Termin (Beginn und Titel) für die Kachel "Kalender"; null, wenn nichts ansteht. */
  naechster: SpielHeute | null;
  spieleDieseWoche: number;
  mannschaftenAnzahl: number;
  /** Nur mit Add-on Vereinsverwaltung (sonst null). */
  mitgliederAnzahl: number | null;
  offeneDienste: number;
  aufgaben: Aufgabe[];
};

type Zeile = {
  id: string;
  start: Date;
  beschreibung: string | null;
  ort: string | null;
  mannschaftName: string | null;
  mannschaftAltersklasse: string | null;
  kategorie: string | null;
};

function alsSpiel(z: Zeile): SpielHeute {
  return {
    id: z.id,
    start: z.start,
    titel: spielTitel(z.beschreibung),
    mannschaft: formatMannschaft(z),
    ort: z.ort,
  };
}

export async function holeNeuesDashboardDaten(p: {
  vereinId: string;
  vereinsverwaltung: boolean;
  kannBearbeiten: boolean;
  // Zähler, die die Startseite ohnehin schon geladen hat (nicht doppelt abfragen).
  abmeldeanfragen: number;
  selbsteintragungen: number;
  ersteSchritte: { erledigt: number; gesamt: number } | null;
  rechnungsdatenFehlen: boolean;
  jetzt?: Date;
}): Promise<NeuesDashboardDaten> {
  const { vereinId } = p;
  const jetzt = p.jetzt ?? new Date();
  const grenzen = tagesGrenzen(jetzt);

  const spalten = {
    id: termine.id,
    start: termine.start,
    beschreibung: termine.beschreibung,
    ort: termine.ort,
    mannschaftName: mannschaften.name,
    mannschaftAltersklasse: mannschaften.altersklasse,
    kategorie: termine.kategorie,
  };

  const [daten, unbesetzte] = await Promise.all([
    withTenant(vereinId, async (tx) => {
      const basis = (...bedingungen: ReturnType<typeof and>[]) =>
        tx
          .select(spalten)
          .from(termine)
          .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
          .where(and(eq(termine.vereinId, vereinId), inArray(termine.typ, SPIEL_TYPEN), ...bedingungen))
          .orderBy(asc(termine.start));
      const [heute, kommend, woche, mannschaftenZeile, mitgliederZeile, antraegeZeile] = await Promise.all([
        basis(gte(termine.start, grenzen.tagVon), lt(termine.start, grenzen.tagBis)),
        basis(gte(termine.start, grenzen.tagBis)).limit(5),
        tx
          .select({ n: count() })
          .from(termine)
          .where(
            and(
              eq(termine.vereinId, vereinId),
              inArray(termine.typ, SPIEL_TYPEN),
              gte(termine.start, grenzen.wocheVon),
              lt(termine.start, grenzen.wocheBis)
            )
          ),
        tx.select({ n: count() }).from(mannschaften).where(eq(mannschaften.vereinId, vereinId)),
        p.vereinsverwaltung
          ? tx.select({ n: count() }).from(mitglieder).where(and(eq(mitglieder.vereinId, vereinId), ne(mitglieder.status, "ausgetreten")))
          : Promise.resolve(null),
        p.vereinsverwaltung
          ? tx.select({ n: count() }).from(beitrittAntraege).where(and(eq(beitrittAntraege.vereinId, vereinId), eq(beitrittAntraege.status, "offen")))
          : Promise.resolve(null),
      ]);
      return {
        heute: heute.map(alsSpiel),
        kommend: kommend.map(alsSpiel),
        woche: woche[0]?.n ?? 0,
        mannschaften: mannschaftenZeile[0]?.n ?? 0,
        mitglieder: mitgliederZeile ? (mitgliederZeile[0]?.n ?? 0) : null,
        antraege: antraegeZeile ? (antraegeZeile[0]?.n ?? 0) : 0,
      };
    }),
    // Dieselbe Besetzungs-Rechnung wie Admin-Kalender und "Unbesetzte Termine" (Schiri, Zeitnehmer, Helferdienste, eigene Dienste).
    holeUnbesetzteTermine(vereinId, 500),
  ]);

  const staende = new Map<string, Besetzungsstand>(
    unbesetzte.map((t) => [t.terminId, { schiriOffen: t.schiriOffen, zeitnehmerOffen: t.zeitnehmerOffen, helferdienstOffen: t.helferdienstOffen }])
  );
  const unbesetzt7Tage = unbesetzte.filter((t) => t.start.getTime() <= jetzt.getTime() + SIEBEN_TAGE_MS).length;
  const kommende = [...daten.heute.filter((s) => s.start.getTime() >= jetzt.getTime()), ...daten.kommend];

  return {
    hero: baueHero(daten.heute, daten.kommend, jetzt, staende),
    naechster: kommende[0] ?? null,
    spieleDieseWoche: daten.woche,
    mannschaftenAnzahl: daten.mannschaften,
    mitgliederAnzahl: daten.mitglieder,
    offeneDienste: unbesetzt7Tage,
    aufgaben: baueAufgaben({
      unbesetzt7Tage,
      abmeldeanfragen: p.abmeldeanfragen,
      selbsteintragungen: p.selbsteintragungen,
      beitrittsantraege: daten.antraege,
      kannBearbeiten: p.kannBearbeiten,
      ersteSchritte: p.ersteSchritte,
      rechnungsdatenFehlen: p.rechnungsdatenFehlen,
    }),
  };
}

/** Termine mit offenen Diensten in den nächsten 7 Tagen (gleiche Rechnung wie "Unbesetzte Termine" und die Kennzahl auf dem Start-Bildschirm). */
export async function zaehleUnbesetzteTermine7Tage(vereinId: string, jetzt: Date = new Date()): Promise<number> {
  const unbesetzte = await holeUnbesetzteTermine(vereinId, 500);
  return unbesetzte.filter((t) => t.start.getTime() <= jetzt.getTime() + SIEBEN_TAGE_MS).length;
}
