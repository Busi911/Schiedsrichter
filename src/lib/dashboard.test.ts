import { describe, expect, it } from "vitest";
import {
  berechneOffeneSchiedsrichterAnzahl,
  berechneOffeneSchiedsrichterTermine,
  berechneOffeneZeitnehmerTermine,
  berechneOffenePosten,
} from "./dashboard";

const verein = {
  testspielOrdnerBedarf: 2,
  testspielKioskdienstBedarf: 1,
  turnierOrdnerBedarf: 0,
  turnierKioskdienstBedarf: 0,
  rundenspielOrdnerBedarf: 0,
  rundenspielKioskdienstBedarf: 0,
  testspielZeitnehmerBedarf: 1,
  turnierZeitnehmerBedarf: 1,
  rundenspielZeitnehmerBedarf: 1,
};

describe("berechneOffenePosten", () => {
  it("bündelt mehrere offene Rollen desselben Termins in einem Posten statt separater Einträge", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: "Halle 1" };
    const posten = berechneOffenePosten(
      verein,
      [termin],
      [{ terminId: "t1", funktionstraegerTyp: "ordner" }]
    );

    expect(posten).toHaveLength(1);
    expect(posten[0].terminId).toBe("t1");
    const ordnerLuecke = posten[0].luecken.find((l) => l.rolle === "ordner");
    expect(ordnerLuecke).toMatchObject({ vorhanden: 1, bedarf: 2 });
    const kioskLuecke = posten[0].luecken.find((l) => l.rolle === "kioskdienst");
    expect(kioskLuecke).toMatchObject({ vorhanden: 0, bedarf: 1 });
    const zeitnehmerLuecke = posten[0].luecken.find((l) => l.rolle === "zeitnehmer");
    expect(zeitnehmerLuecke).toMatchObject({ vorhanden: 0, bedarf: 1 });
  });

  it("meldet keinen Posten, wenn Bedarf und Besetzung vollständig gedeckt sind", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: null };
    const posten = berechneOffenePosten(
      verein,
      [termin],
      [
        { terminId: "t1", funktionstraegerTyp: "ordner" },
        { terminId: "t1", funktionstraegerTyp: "ordner" },
        { terminId: "t1", funktionstraegerTyp: "kioskdienst" },
        { terminId: "t1", funktionstraegerTyp: "zeitnehmer" },
      ]
    );

    expect(posten).toHaveLength(0);
  });

  it("ignoriert Dienste-Bedarf für Termin-Typen ohne konfigurierten Bedarf (0), prüft aber weiterhin Zeitnehmer", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "turnier", ort: null };
    const posten = berechneOffenePosten(verein, [termin], []);
    // "turnier" (Container) ist nicht zeitnehmer-relevant (siehe
    // ZEITNEHMER_RELEVANTE_TYPEN) und hat hier bedarf 0 -> kein Posten.
    expect(posten).toHaveLength(0);
  });

  it("meldet eine fehlende Zeitnehmer/Sekretär-Besetzung auch ohne Ordner-/Kioskdienst-Bedarf", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "rundenspiel", ort: null };
    const posten = berechneOffenePosten(verein, [termin], []);
    expect(posten).toHaveLength(1);
    expect(posten[0].luecken).toEqual([{ rolle: "zeitnehmer", vorhanden: 0, bedarf: 1 }]);
  });

  it("zählt Zeitnehmer und Sekretär gemeinsam für die Zeitnehmer-Rolle", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "rundenspiel", ort: null };
    const posten = berechneOffenePosten(verein, [termin], [
      { terminId: "t1", funktionstraegerTyp: "sekretaer" },
    ]);
    expect(posten).toHaveLength(0);
  });

  it("sortiert Posten nach Startzeit", () => {
    const spaeter = { id: "t2", start: new Date("2026-09-05T10:00:00Z"), typ: "testspiel", ort: null };
    const frueher = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: null };
    const posten = berechneOffenePosten(verein, [spaeter, frueher], []);
    expect(posten[0].terminId).toBe("t1");
  });
});

describe("berechneOffeneSchiedsrichterAnzahl", () => {
  it("zählt ein Freundschaftsspiel ohne zugeordneten Schiedsrichter", () => {
    const anzahl = berechneOffeneSchiedsrichterAnzahl(
      [{ id: "t1", typ: "testspiel" }],
      []
    );
    expect(anzahl).toBe(1);
  });

  it("zählt ein Freundschaftsspiel mit bereits zugeordnetem Schiedsrichter nicht mit", () => {
    const anzahl = berechneOffeneSchiedsrichterAnzahl(
      [{ id: "t1", typ: "testspiel" }],
      [{ terminId: "t1", funktionstraegerTyp: "schiedsrichter" }]
    );
    expect(anzahl).toBe(0);
  });

  it("ignoriert echte Ligaspiele (pflichtspiel = true) — der Verband stellt den Schiedsrichter", () => {
    const anzahl = berechneOffeneSchiedsrichterAnzahl(
      [{ id: "t1", typ: "rundenspiel", pflichtspiel: true }],
      []
    );
    expect(anzahl).toBe(0);
  });

  it("zählt Rundenspiele ohne Pflichtspiel-Status mit", () => {
    const anzahl = berechneOffeneSchiedsrichterAnzahl(
      [{ id: "t1", typ: "rundenspiel", pflichtspiel: false }],
      []
    );
    expect(anzahl).toBe(1);
  });

  it("ignoriert ICS-Feed-Termine (die Person selbst ist der Schiedsrichter)", () => {
    const anzahl = berechneOffeneSchiedsrichterAnzahl(
      [{ id: "t1", typ: "spiel_ics" }],
      []
    );
    expect(anzahl).toBe(0);
  });
});

describe("berechneOffeneSchiedsrichterTermine", () => {
  it("liefert Zeitpunkt, Ort und Mannschaft für ein offenes Spiel", () => {
    const termine = berechneOffeneSchiedsrichterTermine(
      [
        {
          id: "t1",
          typ: "testspiel",
          start: new Date("2026-09-01T10:00:00Z"),
          ort: "Halle 1",
          mannschaftName: "Herren 1",
          mannschaftAltersklasse: null,
        },
      ],
      []
    );
    expect(termine).toHaveLength(1);
    expect(termine[0]).toMatchObject({
      terminId: "t1",
      ort: "Halle 1",
      mannschaftLabel: "Herren 1",
    });
  });

  it("lässt bereits zugeordnete Spiele aus", () => {
    const termine = berechneOffeneSchiedsrichterTermine(
      [{ id: "t1", typ: "testspiel", start: new Date("2026-09-01T10:00:00Z"), ort: null }],
      [{ terminId: "t1", funktionstraegerTyp: "schiedsrichter" }]
    );
    expect(termine).toHaveLength(0);
  });

  it("ignoriert echte Ligaspiele (pflichtspiel = true) — der Verband stellt den Schiedsrichter", () => {
    const termine = berechneOffeneSchiedsrichterTermine(
      [
        {
          id: "t1",
          typ: "rundenspiel",
          pflichtspiel: true,
          start: new Date("2026-09-01T10:00:00Z"),
          ort: null,
        },
      ],
      []
    );
    expect(termine).toHaveLength(0);
  });

  it("sortiert nach Startzeit", () => {
    const spaeter = {
      id: "t2",
      typ: "testspiel",
      start: new Date("2026-09-05T10:00:00Z"),
      ort: null,
    };
    const frueher = {
      id: "t1",
      typ: "testspiel",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: null,
    };
    const termine = berechneOffeneSchiedsrichterTermine([spaeter, frueher], []);
    expect(termine.map((t) => t.terminId)).toEqual(["t1", "t2"]);
  });
});

describe("berechneOffeneZeitnehmerTermine", () => {
  it("meldet einen Termin mit noch offenem Zeitnehmer-/Sekretär-Bedarf", () => {
    const termin = {
      id: "t1",
      typ: "rundenspiel",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: "Halle 1",
    };
    const termine = berechneOffeneZeitnehmerTermine(verein, [termin], []);
    expect(termine).toHaveLength(1);
    expect(termine[0]).toMatchObject({ terminId: "t1", vorhanden: 0, bedarf: 1 });
  });

  it("zählt Zeitnehmer und Sekretär gemeinsam gegen den Bedarf", () => {
    const termin = {
      id: "t1",
      typ: "rundenspiel",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: null,
    };
    const termine = berechneOffeneZeitnehmerTermine(verein, [termin], [
      { terminId: "t1", funktionstraegerTyp: "sekretaer" },
    ]);
    expect(termine).toHaveLength(0);
  });

  it("ignoriert Termin-Typen ohne Zeitnehmer-Relevanz", () => {
    const termin = {
      id: "t1",
      typ: "turnier",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: null,
    };
    const termine = berechneOffeneZeitnehmerTermine(verein, [termin], []);
    expect(termine).toHaveLength(0);
  });

  it("ignoriert Termine ohne konfigurierten Bedarf (0)", () => {
    const ohneBedarf = { ...verein, rundenspielZeitnehmerBedarf: 0 };
    const termin = {
      id: "t1",
      typ: "rundenspiel",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: null,
    };
    const termine = berechneOffeneZeitnehmerTermine(ohneBedarf, [termin], []);
    expect(termine).toHaveLength(0);
  });

  it("sortiert nach Startzeit", () => {
    const spaeter = {
      id: "t2",
      typ: "rundenspiel",
      start: new Date("2026-09-05T10:00:00Z"),
      ort: null,
    };
    const frueher = {
      id: "t1",
      typ: "rundenspiel",
      start: new Date("2026-09-01T10:00:00Z"),
      ort: null,
    };
    const termine = berechneOffeneZeitnehmerTermine(verein, [spaeter, frueher], []);
    expect(termine.map((t) => t.terminId)).toEqual(["t1", "t2"]);
  });
});
