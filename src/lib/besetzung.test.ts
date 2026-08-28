import { describe, expect, it } from "vitest";
import {
  berechneBesetzung,
  brauchtSchiedsrichterVomVerein,
  istBesetzungVollstaendig,
} from "./besetzung";

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

  it("respektiert eine konfigurierte Zeitnehmer/Sekretär-Mindestanzahl statt fest 1", () => {
    const einer = berechneBesetzung(
      [{ funktionstraegerTyp: "zeitnehmer" }],
      false,
      2
    );
    expect(einer.zeitnehmerSekretaerErfuellt).toBe(false);

    const zwei = berechneBesetzung(
      [
        { funktionstraegerTyp: "zeitnehmer" },
        { funktionstraegerTyp: "sekretaer" },
      ],
      false,
      2
    );
    expect(zwei.zeitnehmerSekretaerErfuellt).toBe(true);
  });

  it("zählt eine nuLiga/handball.net-Ansetzung ohne eigene Zuordnung als Besetzung mit", () => {
    const nurSchiri = berechneBesetzung([], false, undefined, undefined, 1, 0);
    expect(nurSchiri.schiriAnzahl).toBe(1);
    expect(nurSchiri.schiriErfuellt).toBe(true);
    expect(nurSchiri.zeitnehmerSekretaerErfuellt).toBe(false);

    const beides = berechneBesetzung([], false, undefined, undefined, 1, 1);
    expect(beides.vollstaendig).toBe(true);
  });

  it("respektiert eine konfigurierte Zeitnehmer/Sekretär-Obergrenze statt fest 2", () => {
    const drei = berechneBesetzung(
      [
        { funktionstraegerTyp: "zeitnehmer" },
        { funktionstraegerTyp: "zeitnehmer" },
        { funktionstraegerTyp: "sekretaer" },
      ],
      false,
      1,
      4
    );
    expect(drei.zeitnehmerSekretaerAnzahl).toBe(3);
    expect(drei.zeitnehmerSekretaerVoll).toBe(false);
  });
});

describe("istBesetzungVollstaendig", () => {
  it("verlangt bei echten Ligaspielen (pflichtspiel = true) nur Zeitnehmer/Sekretär, keinen Schiedsrichter (kommt vom Verband)", () => {
    const nurZeitnehmer = berechneBesetzung([
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(nurZeitnehmer, "rundenspiel", true)).toBe(
      true
    );

    const nichts = berechneBesetzung([]);
    expect(istBesetzungVollstaendig(nichts, "rundenspiel", true)).toBe(false);
  });

  it("verlangt bei Freundschaftsspielen/Turnieren im Liga-Spielplan (pflichtspiel = false) weiterhin auch einen Schiedsrichter", () => {
    // Regression: der Verband stellt den Schiedsrichter nur bei echten
    // Ligaspielen automatisch — bei Freundschaftsspielen/Turnieren im
    // Liga-Spielplan (typ = "rundenspiel", pflichtspiel = false) ordnet der
    // Verein selbst einen zu und meldet ihn im Nachgang an den Verband.
    const nurZeitnehmer = berechneBesetzung([
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(nurZeitnehmer, "rundenspiel", false)).toBe(
      false
    );

    const beides = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(beides, "rundenspiel", false)).toBe(true);
  });

  it("verlangt ohne bekannten pflichtspiel-Wert (null/undefined) sicherheitshalber ebenfalls einen Schiedsrichter", () => {
    const nurZeitnehmer = berechneBesetzung([
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(nurZeitnehmer, "rundenspiel")).toBe(false);
    expect(istBesetzungVollstaendig(nurZeitnehmer, "rundenspiel", null)).toBe(
      false
    );
  });

  it("verlangt bei allen anderen besetzungsrelevanten Typen weiterhin auch einen Schiedsrichter", () => {
    const nurZeitnehmer = berechneBesetzung([
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(nurZeitnehmer, "testspiel")).toBe(false);

    const beides = berechneBesetzung([
      { funktionstraegerTyp: "schiedsrichter" },
      { funktionstraegerTyp: "zeitnehmer" },
    ]);
    expect(istBesetzungVollstaendig(beides, "testspiel")).toBe(true);
  });
});

describe("brauchtSchiedsrichterVomVerein", () => {
  it("verlangt einen vereinseigenen Schiedsrichter bei Freundschaftsspiel und Turnierspiel", () => {
    expect(brauchtSchiedsrichterVomVerein({ typ: "testspiel" })).toBe(true);
    expect(brauchtSchiedsrichterVomVerein({ typ: "turnier_spiel" })).toBe(true);
  });

  it("verlangt einen vereinseigenen Schiedsrichter bei Rundenspielen ohne Pflichtspiel-Status", () => {
    expect(
      brauchtSchiedsrichterVomVerein({ typ: "rundenspiel", pflichtspiel: false })
    ).toBe(true);
  });

  it("verlangt KEINEN vereinseigenen Schiedsrichter bei echten Ligaspielen (Verband stellt ihn)", () => {
    expect(
      brauchtSchiedsrichterVomVerein({ typ: "rundenspiel", pflichtspiel: true })
    ).toBe(false);
  });

  it("verlangt KEINEN vereinseigenen Schiedsrichter bei ICS-Feed-Terminen (Person IST der Schiedsrichter)", () => {
    expect(brauchtSchiedsrichterVomVerein({ typ: "spiel_ics" })).toBe(false);
  });
});
