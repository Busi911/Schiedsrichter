import { describe, expect, it } from "vitest";
import { berechneOffenePosten } from "./dashboard";

const verein = {
  testspielOrdnerBedarf: 2,
  testspielKioskdienstBedarf: 1,
  turnierOrdnerBedarf: 0,
  turnierKioskdienstBedarf: 0,
  rundenspielOrdnerBedarf: 0,
  rundenspielKioskdienstBedarf: 0,
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
