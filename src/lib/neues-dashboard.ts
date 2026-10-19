// Reine Rechnung für den Start-Bildschirm im neuen App-Design (ohne DB, getestet in neues-dashboard.test.ts): Begrüßung, "Heute"-Karte,
// Aufgaben ("Braucht dich") und die Wochen-/Tagesgrenzen in deutscher Zeit. Die Daten dazu lädt lib/neues-dashboard-daten.ts.
import { addiereTage, berlinJetzt, wochentagVonDatum } from "./training-ausfall";

/** "Guten Morgen/Tag/Abend" nach deutscher Uhrzeit, mit Vorname, wenn bekannt. */
export function begruessung(jetzt: Date, name?: string | null): string {
  const stunde = Math.floor(berlinJetzt(jetzt).minuten / 60);
  const gruss = stunde >= 5 && stunde < 11 ? "Guten Morgen" : stunde >= 11 && stunde < 18 ? "Guten Tag" : "Guten Abend";
  const vorname = name?.trim().split(/\s+/)[0];
  return vorname ? `${gruss}, ${vorname}!` : `${gruss}!`;
}

/** Beginn (inklusive) und Ende (exklusive) des heutigen Tages sowie der laufenden Woche (Mo–So) als Zeitpunkte, Grenzen in deutscher Zeit. */
export function tagesGrenzen(jetzt: Date): { tagVon: Date; tagBis: Date; wocheVon: Date; wocheBis: Date } {
  const heute = berlinJetzt(jetzt).datum;
  const montag = addiereTage(heute, -wochentagVonDatum(heute));
  return {
    tagVon: berlinTagesbeginn(heute),
    tagBis: berlinTagesbeginn(addiereTage(heute, 1)),
    wocheVon: berlinTagesbeginn(montag),
    wocheBis: berlinTagesbeginn(addiereTage(montag, 7)),
  };
}

// Mitternacht eines deutschen Kalendertags als Zeitpunkt. Eigene Rechnung statt parseBerlinDatumZeit: dessen Offset gilt für den ganzen Tag (aus 12:00 UTC
// bestimmt) und wäre am Tag der Zeitumstellung um eine Stunde falsch. Hier gilt der Offset, bei dem 00:00 wirklich der erste Moment des Tages ist.
function berlinTagesbeginn(datum: string): Date {
  for (const offset of ["+01:00", "+02:00"]) {
    const kandidat = new Date(`${datum}T00:00:00${offset}`);
    if (berlinJetzt(kandidat).datum === datum && berlinJetzt(new Date(kandidat.getTime() - 60_000)).datum !== datum) return kandidat;
  }
  return new Date(`${datum}T00:00:00+01:00`);
}

export type SpielHeute = {
  id: string;
  start: Date;
  /** "Heim – Gast" bzw. die Beschreibung des Termins, ohne die Zusätze nach " · ". */
  titel: string | null;
  mannschaft: string | null;
  ort: string | null;
};

export type Besetzungsstand = { schiriOffen: boolean; zeitnehmerOffen: boolean; helferdienstOffen: boolean };

export type HeroChip = { text: string; offen: boolean };

export type Hero = {
  /** "heute" = es gibt heute noch ein Spiel; "naechstes" = heute nichts mehr, das nächste Spiel steht an; "keins" = nichts in Sicht. */
  art: "heute" | "naechstes" | "keins";
  /** Anzahl der Spiele heute (auch bereits gespielte). */
  anzahlHeute: number;
  spiel: SpielHeute | null;
  chips: HeroChip[];
};

// Ein Spiel zählt noch als "läuft/folgt", bis es seit mehr als zwei Stunden angeworfen ist.
const SPIEL_DAUER_MS = 2 * 60 * 60 * 1000;

/** Titel eines Termins: nur der erste Teil der Beschreibung ("Heim – Gast"), die Zusätze (Kategorie, Spielart, Kürzel) stehen schon an anderer Stelle. */
export function spielTitel(beschreibung: string | null | undefined): string | null {
  const erster = beschreibung?.split(" · ")[0]?.trim();
  return erster ? erster : null;
}

/** Chips für die Besetzung eines Spiels: nur für Spiele, die in der Besetzungs-Rechnung vorkommen; fehlt der Stand, ist alles besetzt. */
export function besetzungsChips(stand: Besetzungsstand | undefined): HeroChip[] {
  if (!stand) return [{ text: "Alles besetzt", offen: false }];
  const chips: HeroChip[] = [];
  chips.push({ text: stand.schiriOffen ? "Schiedsrichter fehlt" : "Schiedsrichter ✓", offen: stand.schiriOffen });
  chips.push({ text: stand.zeitnehmerOffen ? "Zeitnehmer fehlt" : "Zeitnehmer ✓", offen: stand.zeitnehmerOffen });
  if (stand.helferdienstOffen) chips.push({ text: "Helferdienst fehlt", offen: true });
  return chips;
}

/**
 * "Heute"-Karte: das erste heutige Spiel, das noch nicht länger als zwei Stunden läuft; sonst das nächste künftige Spiel.
 * `heute` = alle Spiele des heutigen Tages (nach Beginn sortiert), `kommend` = die nächsten künftigen Spiele nach heute.
 */
export function baueHero(heute: SpielHeute[], kommend: SpielHeute[], jetzt: Date, staende: Map<string, Besetzungsstand>): Hero {
  const sortiert = [...heute].sort((a, b) => a.start.getTime() - b.start.getTime());
  const offen = sortiert.find((s) => s.start.getTime() + SPIEL_DAUER_MS > jetzt.getTime());
  if (offen) return { art: "heute", anzahlHeute: sortiert.length, spiel: offen, chips: besetzungsChips(staende.get(offen.id)) };
  const naechstes = [...kommend].sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (naechstes) return { art: "naechstes", anzahlHeute: sortiert.length, spiel: naechstes, chips: besetzungsChips(staende.get(naechstes.id)) };
  return { art: "keins", anzahlHeute: sortiert.length, spiel: null, chips: [] };
}

export type Aufgabe = {
  schluessel: "erste-schritte" | "rechnungsdaten" | "offene-dienste" | "dienste" | "abmeldungen" | "selbsteintragungen" | "beitritt";
  anzahl: number;
  titel: string;
  hinweis: string;
  href: string;
  aktion: string;
  ton: "warnung" | "info";
};

/** Offene Aufgaben für "Braucht dich", nur mit Anzahl > 0, in fester Reihenfolge (Dienste zuerst). Links zeigen auf die Stelle, an der die Aufgabe erledigt wird. */
export function baueAufgaben(z: {
  unbesetzt7Tage: number;
  abmeldeanfragen: number;
  selbsteintragungen: number;
  beitrittsantraege: number;
  kannBearbeiten: boolean;
  /** Checkliste "Erste Schritte", solange sie noch nicht abgehakt ist (nur Vereinsadmins); null = nichts offen. */
  ersteSchritte?: { erledigt: number; gesamt: number } | null;
  /** Rechnungsadresse oder E-Mail fehlt (nur nach dem Beta-Ende, nur Vereinsadmins). */
  rechnungsdatenFehlen?: boolean;
}): Aufgabe[] {
  const liste: Aufgabe[] = [];
  if (z.ersteSchritte) {
    liste.push({
      schluessel: "erste-schritte",
      anzahl: z.ersteSchritte.gesamt - z.ersteSchritte.erledigt,
      titel: "Erste Schritte",
      hinweis: `${z.ersteSchritte.erledigt} von ${z.ersteSchritte.gesamt} erledigt`,
      href: "#erste-schritte",
      aktion: "Weiter",
      ton: "info",
    });
  }
  if (z.rechnungsdatenFehlen) {
    liste.push({
      schluessel: "rechnungsdaten",
      anzahl: 1,
      titel: "Rechnungsdaten fehlen",
      hinweis: "ohne sie können wir keine Rechnung stellen",
      href: "#rechnungsdaten",
      aktion: "Eintragen",
      ton: "warnung",
    });
  }
  if (z.unbesetzt7Tage > 0) {
    liste.push({
      schluessel: "dienste",
      anzahl: z.unbesetzt7Tage,
      titel: z.unbesetzt7Tage === 1 ? "Termin mit offenen Diensten" : "Termine mit offenen Diensten",
      hinweis: "nächste 7 Tage",
      href: "/admin/dienste",
      aktion: z.kannBearbeiten ? "Einteilen" : "Ansehen",
      ton: "warnung",
    });
  }
  if (z.abmeldeanfragen > 0) {
    liste.push({
      schluessel: "abmeldungen",
      anzahl: z.abmeldeanfragen,
      titel: z.abmeldeanfragen === 1 ? "Abmeldeanfrage" : "Abmeldeanfragen",
      hinweis: "warten auf Antwort",
      href: "#abmeldeanfragen",
      aktion: z.kannBearbeiten ? "Prüfen" : "Ansehen",
      ton: "warnung",
    });
  }
  if (z.selbsteintragungen > 0) {
    liste.push({
      schluessel: "selbsteintragungen",
      anzahl: z.selbsteintragungen,
      titel: z.selbsteintragungen === 1 ? "Selbsteintragung" : "Selbsteintragungen",
      hinweis: "zum Bestätigen",
      href: "#selbsteintragungen",
      aktion: z.kannBearbeiten ? "Bestätigen" : "Ansehen",
      ton: "info",
    });
  }
  if (z.beitrittsantraege > 0) {
    liste.push({
      schluessel: "beitritt",
      anzahl: z.beitrittsantraege,
      titel: z.beitrittsantraege === 1 ? "Beitrittsantrag" : "Beitrittsanträge",
      hinweis: "offen",
      href: "/admin/mitglieder#antraege",
      aktion: "Ansehen",
      ton: "info",
    });
  }
  return liste;
}

export type ProfilEinsatz = { id: string; start: Date; titel: string | null; ort: string | null; rollen: string[] };

export type ProfilHero = {
  /** "einsatz" = nächster eigener Einsatz (oder noch laufender), "keins" = nichts eingetragen. */
  art: "einsatz" | "keins";
  einsatz: ProfilEinsatz | null;
  /** Einsätze in den nächsten sieben Tagen (inklusive des angezeigten). */
  anzahl7Tage: number;
  /** Der Einsatz ist heute (deutscher Kalendertag). */
  heute: boolean;
};

/** "Dein nächster Einsatz" für die persönliche Startseite: der erste eigene Termin, der noch nicht länger als zwei Stunden läuft. */
export function baueProfilHero(einsaetze: ProfilEinsatz[], jetzt: Date): ProfilHero {
  const sortiert = [...einsaetze].sort((a, b) => a.start.getTime() - b.start.getTime());
  const anstehend = sortiert.filter((e) => e.start.getTime() + SPIEL_DAUER_MS > jetzt.getTime());
  const erster = anstehend[0];
  if (!erster) return { art: "keins", einsatz: null, anzahl7Tage: 0, heute: false };
  const { tagVon, tagBis } = tagesGrenzen(jetzt);
  return {
    art: "einsatz",
    einsatz: erster,
    anzahl7Tage: anstehend.filter((e) => e.start.getTime() <= jetzt.getTime() + 7 * 24 * 60 * 60 * 1000).length,
    heute: erster.start.getTime() >= tagVon.getTime() && erster.start.getTime() < tagBis.getTime(),
  };
}
