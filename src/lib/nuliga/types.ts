// Öffentliche Sportdaten, die aus nuLiga übernommen werden dürfen. Diese
// Typen sind bewusst eine WHITELIST: Mannschaftsverantwortliche,
// Schiedsrichter (Namen/Kürzel) und Kalender-Tokens, die in denselben
// Seiten stehen, haben hier kein Feld und können deshalb gar nicht erst
// persistiert werden (siehe Datenschutz-Tests in parsers/*.test.ts).

export type Geschlecht = "m" | "w" | "gemischt";

export type MannschaftsKategorie =
  | "herren"
  | "damen"
  | "jugend_maennlich"
  | "jugend_weiblich"
  | "kinder"
  | "sonstige";

export type Doppelwert = { plus: number; minus: number };

export type SpielStatus =
  | "geplant"
  | "verlegt"
  | "abgesagt"
  | "nicht_angetreten"
  | "gespielt";

export type NuligaSpiel = {
  // Spielnummer innerhalb der Gruppe ("Nr."); zusammen mit der Gruppen-ID der
  // stabile Schlüssel eines Spiels.
  spielnummer: number | null;
  // Globale nuLiga-Meeting-ID, nur bei gespielten Spielen verlinkt.
  meetingId: string | null;
  // Gruppen-ID aus dem Spielbericht-Link, falls dort vorhanden.
  gruppenId: string | null;
  datum: string; // ISO yyyy-mm-dd
  uhrzeit: string | null; // HH:MM, null bei "Termin offen"
  beginn: Date | null;
  // Nur bei verlegten Spielen: der ursprüngliche Termin laut Tooltip.
  urspruenglicherBeginn: Date | null;
  halle: { name: string | null; nummer: string | null; nuligaId: string | null } | null;
  ligaKuerzel: string | null;
  heim: string;
  gast: string;
  tore: Doppelwert | null; // Heim:Gast
  halbzeit: Doppelwert | null;
  ergebnisBestaetigt: boolean;
  status: SpielStatus;
};

export type TabellenZeile = {
  rang: number;
  mannschaft: string;
  teamtableId: string | null;
  spiele: number | null;
  siege: number | null;
  unentschieden: number | null;
  niederlagen: number | null;
  tore: Doppelwert | null;
  punkte: Doppelwert | null;
  // nuLiga: "zurückgezogen am …" statt Spielstatistik — die Mannschaft nimmt
  // nicht (mehr) teil, hat keine Spiele.
  zurueckgezogen?: boolean;
};

export type LigaInfo = {
  name: string;
  geschlecht: Geschlecht | null;
  altersklasse: string | null;
  spielklasse: string | null;
  gruppe: string | null;
  istMeldeliste: boolean;
};

export type ParseErgebnis<T> = { daten: T; warnungen: string[] };

export type ClubTeamEintrag = {
  abschnitt: string;
  championship: string;
  saison: string | null; // "2026/27"
  regulaer: boolean;
  gruppenId: string;
  mannschaftsname: string;
  ligaName: string;
  rang: number | null;
  punkte: Doppelwert | null;
};

export type ClubTeamsSeite = {
  vereinsname: string | null;
  clubId: string | null;
  teams: ClubTeamEintrag[];
};

export type GruppenSeite = {
  championship: string | null;
  gruppenId: string | null;
  liga: LigaInfo | null;
  tabelle: TabellenZeile[];
  spiele: NuligaSpiel[];
};

export type TeamPortraitSeite = {
  championship: string | null;
  gruppenId: string | null;
  teamtableId: string | null;
  liga: LigaInfo | null;
  mannschaftsname: string | null;
  clubId: string | null;
  vereinsname: string | null;
  tabellenstand: {
    rang: number;
    punkte: Doppelwert;
    tore: Doppelwert;
    siege: number;
    unentschieden: number;
    niederlagen: number;
  } | null;
  spiele: NuligaSpiel[];
};
