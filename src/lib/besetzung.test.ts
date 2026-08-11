import { describe, expect, it } from "vitest";
import { berechneBesetzung } from "./besetzung";

describe("berechneBesetzung", () => {
  it("ist unvollständig ohne jede Zuordnung", () => {
    const status = berechneBesetzung([]);
    expect(status.schiriErfuellt).toBe(false);
    expect(status.zeitnehmerSekretaerErfuellt).toBe(false);
    expect(status.vollstaendig).toBe(false);
  });

  it("Schiedsrichter-Pflicht ist mit einer Person erfüllt, Gespann erst mit zwei voll", () => {
    const status = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
    ]);
    expect(status.schiriErfuellt).toBe(true);
    expect(status.schiriVoll).toBe(false);

    const gespann = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
      { funktionstraegerTyp: "schiedsrichter" },
    ]);
    expect(gespann.schiriVoll).toBe(true);
  });

  it("zählt den ICS-Schiedsrichter als Besetzung mit", () => {
    const status = berechneBesetzung([], true);
    expect(status.schiriAnzahl).toBe(1);
    expect(status.schiriErfuellt).toBe(true);
  });

  it("Zeitnehmer und Sekretär zählen gemeinsam für die zweite Pflichtrolle", () => {
    const status = berechneBesetzung([
      { funktionstraegerTyp: "zeitnehmer" },
      { funktionstraegerTyp: "sekretaer" },
    ]);
    expect(status.zeitnehmerSekretaerAnzahl).toBe(2);
    expect(status.zeitnehmerSekretaerErfuellt).toBe(true);
    expect(status.zeitnehmerSekretaerVoll).toBe(true);
  });

  it("ist erst vollständig, wenn beide Pflichtrollen erfüllt sind", () => {
    const nurSchiri = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
    ]);
    expect(nurSchiri.vollstaendig).toBe(false);

    const beides = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(beides.vollstaendig).toBe(true);
  });

  it("ignoriert andere Rollen (Ordner/Kioskdienst/Trainer) bei der Berechnung", () => {
    const status = berechneBesetzung([
      { funktionstraegerTyp: "ordner" },
      { funktionstraegerTyp: "kioskdienst" },
      { funktionstraegerTyp: "trainer" },
    ]);
    expect(status.schiriAnzahl).toBe(0);
    expect(status.zeitnehmerSekretaerAnzahl).toBe(0);
  });
});
