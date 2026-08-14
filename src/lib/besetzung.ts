// Pflichtbesetzung eines Spiels: mindestens 1 Schiedsrichter (max. 2 als
// Gespann), sowie eine konfigurierbare Mindestanzahl Zeitnehmer/Sekretär
// (Obergrenze ebenfalls konfigurierbar, siehe vereine.zeitnehmerSekretaerMax
// und testspiel-/turnier-/rundenspielZeitnehmerBedarf in db/schema.ts sowie
// bedarfFuer in dienste.ts). Rein berechnet aus bereits vorhandenen
// Zuordnungen — kein DB-Zugriff, daher ohne Testdatenbank testbar (siehe
// besetzung.test.ts).

export const SCHIRI_GESPANN_MAX = 2;
// Fallback-Werte, falls kein Verein/keine Einstellung übergeben wird (z.B.
// in bestehenden Tests) — entsprechen dem bisherigen festen Verhalten.
export const ZEITNEHMER_SEKRETAER_BEDARF_STANDARD = 1;
export const ZEITNEHMER_SEKRETAER_MAX_STANDARD = 2;

export type Besetzungsstatus = {
  schiriAnzahl: number;
  schiriErfuellt: boolean;
  schiriVoll: boolean;
  zeitnehmerSekretaerAnzahl: number;
  zeitnehmerSekretaerErfuellt: boolean;
  zeitnehmerSekretaerVoll: boolean;
  vollstaendig: boolean;
};

export function berechneBesetzung(
  zuordnungen: { funktionstraegerTyp: string }[],
  hatIcsSchiedsrichter = false,
  zeitnehmerSekretaerBedarf = ZEITNEHMER_SEKRETAER_BEDARF_STANDARD,
  zeitnehmerSekretaerMax = ZEITNEHMER_SEKRETAER_MAX_STANDARD
): Besetzungsstatus {
  const schiriAnzahl =
    zuordnungen.filter((z) => z.funktionstraegerTyp === "schiedsrichter")
      .length + (hatIcsSchiedsrichter ? 1 : 0);
  const zeitnehmerSekretaerAnzahl = zuordnungen.filter(
    (z) =>
      z.funktionstraegerTyp === "zeitnehmer" ||
      z.funktionstraegerTyp === "sekretaer"
  ).length;

  const schiriErfuellt = schiriAnzahl >= 1;
  const zeitnehmerSekretaerErfuellt =
    zeitnehmerSekretaerAnzahl >= zeitnehmerSekretaerBedarf;

  return {
    schiriAnzahl,
    schiriErfuellt,
    schiriVoll: schiriAnzahl >= SCHIRI_GESPANN_MAX,
    zeitnehmerSekretaerAnzahl,
    zeitnehmerSekretaerErfuellt,
    zeitnehmerSekretaerVoll: zeitnehmerSekretaerAnzahl >= zeitnehmerSekretaerMax,
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
