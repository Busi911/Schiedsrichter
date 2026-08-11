// Pflichtbesetzung eines Spiels: mindestens 1 Schiedsrichter (max. 2 als
// Gespann), sowie mindestens 1 Zeitnehmer ODER Sekretär (max. 2 zusammen).
// Rein berechnet aus bereits vorhandenen Zuordnungen — kein DB-Zugriff,
// daher ohne Testdatenbank testbar (siehe besetzung.test.ts).

export const SCHIRI_GESPANN_MAX = 2;
export const ZEITNEHMER_SEKRETAER_MAX = 2;

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
  hatIcsSchiedsrichter = false
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
  const zeitnehmerSekretaerErfuellt = zeitnehmerSekretaerAnzahl >= 1;

  return {
    schiriAnzahl,
    schiriErfuellt,
    schiriVoll: schiriAnzahl >= SCHIRI_GESPANN_MAX,
    zeitnehmerSekretaerAnzahl,
    zeitnehmerSekretaerErfuellt,
    zeitnehmerSekretaerVoll: zeitnehmerSekretaerAnzahl >= ZEITNEHMER_SEKRETAER_MAX,
    vollstaendig: schiriErfuellt && zeitnehmerSekretaerErfuellt,
  };
}
