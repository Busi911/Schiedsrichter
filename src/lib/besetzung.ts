// Pflichtbesetzung eines Spiels: mindestens 1 Schiedsrichter (max. 2 als
// Gespann), sowie eine konfigurierbare Mindestanzahl Zeitnehmer/Sekretär
// (siehe testspiel-/turnier-/rundenspielZeitnehmerBedarf in db/schema.ts
// sowie bedarfFuer in dienste.ts) — Obergrenze je Rolle fest 1: es gibt
// jeweils nur EINEN Platz am Tisch für Zeitnehmer bzw. Sekretär, anders als
// beim Schiedsrichter-Gespann keine konfigurierbare Team-Größe. Rein
// berechnet aus bereits vorhandenen Zuordnungen — kein DB-Zugriff, daher
// ohne Testdatenbank testbar (siehe besetzung.test.ts).

export const SCHIRI_GESPANN_MAX = 2;
export const ZEITNEHMER_ROLLE_MAX = 1;
export const SEKRETAER_ROLLE_MAX = 1;
// Fallback-Wert, falls kein Verein/keine Einstellung übergeben wird (z.B. in
// bestehenden Tests) — entspricht dem bisherigen festen Verhalten.
export const ZEITNEHMER_SEKRETAER_BEDARF_STANDARD = 1;

// nuLiga/handball.net liefern die angesetzten Namen als EIN kommagetrenntes
// Feld ("Mustermann, Schmidt") — gezählt wird daraus die Anzahl Personen.
export function zaehleAngesetzteNamen(feld: string | null | undefined): number {
  if (!feld) return 0;
  return feld.split(",").filter((teil) => teil.trim()).length;
}

export type ExternAngesetzterTermin = {
  handballNetSchiedsrichter?: string | null;
  nuligaSchiedsrichterKuerzel?: string | null;
  handballNetZeitnehmer?: string | null;
};

// Leitet aus den Verbands-/Gegner-Feldern eines Termins ab, wie viele
// Schiedsrichter bzw. Zeitnehmer/Sekretär bereits extern angesetzt sind, und
// zwar nur, solange es dafür keine EIGENE Zuordnung gibt (sonst würde dieselbe
// Person doppelt zählen). Zentral hier statt je Aufrufer, damit Monatskalender,
// Dashboard und die Wart-Erinnerungen denselben Termin nicht unterschiedlich
// bewerten — genau das ist zuvor auseinandergelaufen.
export function externeAnsetzungsAnzahlen(
  termin: ExternAngesetzterTermin,
  zuordnungen: { funktionstraegerTyp: string }[]
): { externeSchiriAnzahl: number; externeZeitnehmerSekretaerAnzahl: number } {
  const hatEigenenSchiri = zuordnungen.some(
    (z) => z.funktionstraegerTyp === "schiedsrichter"
  );
  const hatEigenenZeitnehmer = zuordnungen.some(
    (z) =>
      z.funktionstraegerTyp === "zeitnehmer" ||
      z.funktionstraegerTyp === "sekretaer"
  );
  return {
    externeSchiriAnzahl: hatEigenenSchiri
      ? 0
      : termin.handballNetSchiedsrichter
        ? zaehleAngesetzteNamen(termin.handballNetSchiedsrichter)
        : termin.nuligaSchiedsrichterKuerzel
          ? 1
          : 0,
    externeZeitnehmerSekretaerAnzahl: hatEigenenZeitnehmer
      ? 0
      : zaehleAngesetzteNamen(termin.handballNetZeitnehmer),
  };
}

export type Besetzungsstatus = {
  schiriAnzahl: number;
  schiriErfuellt: boolean;
  schiriVoll: boolean;
  zeitnehmerAnzahl: number;
  zeitnehmerVoll: boolean;
  sekretaerAnzahl: number;
  sekretaerVoll: boolean;
  zeitnehmerSekretaerAnzahl: number;
  zeitnehmerSekretaerErfuellt: boolean;
  // Beide Rollen (je max. 1) besetzt — keine weitere Zuordnung mehr möglich.
  zeitnehmerSekretaerVoll: boolean;
  vollstaendig: boolean;
};

export function berechneBesetzung(
  zuordnungen: { funktionstraegerTyp: string }[],
  hatIcsSchiedsrichter = false,
  zeitnehmerSekretaerBedarf = ZEITNEHMER_SEKRETAER_BEDARF_STANDARD,
  // Schiedsrichter bzw. Zeitnehmer/Sekretär, die zwar noch keine eigene
  // terminZuordnungen-Zeile haben (kein Konto im System bzw. Name passt zu
  // keinem Funktionsträger), aber laut nuLiga/handball.net bereits vom
  // Verband/Gegner gestellt sind — siehe die "(noch nicht zugeordnet)"-Hinweise
  // in admin-kalender.ts. Diese Rolle gilt dann trotzdem als besetzt: die
  // externe Quelle bestätigt bereits eine Person, es fehlt nur der interne
  // Datensatz. Fließt NUR in die (kombinierte) Mindestanzahl-Prüfung ein,
  // nicht in zeitnehmerVoll/sekretaerVoll: welche der beiden Rollen die
  // extern gemeldete Person konkret ausfüllt, ist aus der externen Quelle
  // nicht bekannt.
  externeSchiriAnzahl = 0,
  externeZeitnehmerSekretaerAnzahl = 0
): Besetzungsstatus {
  const schiriAnzahl =
    zuordnungen.filter((z) => z.funktionstraegerTyp === "schiedsrichter")
      .length +
    (hatIcsSchiedsrichter ? 1 : 0) +
    externeSchiriAnzahl;
  const zeitnehmerAnzahl = zuordnungen.filter(
    (z) => z.funktionstraegerTyp === "zeitnehmer"
  ).length;
  const sekretaerAnzahl = zuordnungen.filter(
    (z) => z.funktionstraegerTyp === "sekretaer"
  ).length;
  const zeitnehmerSekretaerAnzahl =
    zeitnehmerAnzahl + sekretaerAnzahl + externeZeitnehmerSekretaerAnzahl;

  const schiriErfuellt = schiriAnzahl >= 1;
  const zeitnehmerSekretaerErfuellt =
    zeitnehmerSekretaerAnzahl >= zeitnehmerSekretaerBedarf;
  const zeitnehmerVoll = zeitnehmerAnzahl >= ZEITNEHMER_ROLLE_MAX;
  const sekretaerVoll = sekretaerAnzahl >= SEKRETAER_ROLLE_MAX;

  return {
    schiriAnzahl,
    schiriErfuellt,
    schiriVoll: schiriAnzahl >= SCHIRI_GESPANN_MAX,
    zeitnehmerAnzahl,
    zeitnehmerVoll,
    sekretaerAnzahl,
    sekretaerVoll,
    zeitnehmerSekretaerAnzahl,
    zeitnehmerSekretaerErfuellt,
    zeitnehmerSekretaerVoll: zeitnehmerVoll && sekretaerVoll,
    vollstaendig: schiriErfuellt && zeitnehmerSekretaerErfuellt,
  };
}

// Bei ECHTEN Ligaspielen (Rundenspiel mit pflichtspiel = true) stellt der
// Verband den Schiedsrichter — der Verein braucht nur Zeitnehmer/Sekretär.
// Bei Rundenspielen mit pflichtspiel = false (Freundschaftsspiel/Turnier
// innerhalb des Liga-Spielplans, siehe rundenspiel-import.ts) gilt das
// NICHT: der Verein ordnet hier selbst einen Schiedsrichter zu und meldet
// ihn im Nachgang an den Verband — die Schiri-Pflicht aus
// berechneBesetzung() gilt daher wie bei allen anderen besetzungsrelevanten
// Typen (Testspiel, Turnierspiel, ICS-Spiel).
export function istBesetzungVollstaendig(
  status: Besetzungsstatus,
  typ: string,
  pflichtspiel?: boolean | null
): boolean {
  if (typ === "rundenspiel" && pflichtspiel === true) {
    return status.zeitnehmerSekretaerErfuellt;
  }
  return status.vollstaendig;
}

// Nur diese Typen: der Verein ordnet hier selbst einen Schiedsrichter zu.
// spiel_ics (persönliche ICS-Feed-Einsätze, siehe termine.icsSchiedsrichterId)
// bleibt bewusst außen vor — dort IST die Person bereits der Schiedsrichter,
// es gibt nichts zuzuordnen. Echte Ligaspiele (rundenspiel mit
// pflichtspiel = true) stellt der Verband, siehe istBesetzungVollstaendig oben.
export function brauchtSchiedsrichterVomVerein(termin: {
  typ: string;
  pflichtspiel?: boolean | null;
}): boolean {
  if (termin.typ === "rundenspiel") return termin.pflichtspiel !== true;
  return termin.typ === "testspiel" || termin.typ === "turnier_spiel";
}
