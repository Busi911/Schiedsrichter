import { describe, expect, it } from "vitest";
import { berechneUnbesetzteDienste } from "./dashboard";

const verein = {
  testspielOrdnerBedarf: 2,
  testspielKioskdienstBedarf: 1,
  turnierOrdnerBedarf: 0,
  turnierKioskdienstBedarf: 0,
  rundenspielOrdnerBedarf: 0,
  rundenspielKioskdienstBedarf: 0,
};

describe("berechneUnbesetzteDienste", () => {
  it("meldet eine Lücke, wenn weniger angemeldet sind als Bedarf besteht", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: "Halle 1" };
    const luecken = berechneUnbesetzteDienste(
      verein,
      [termin],
      [{ terminId: "t1", funktionstraegerTyp: "ordner" }]
    );

    expect(luecken).toHaveLength(2);
    const ordnerLuecke = luecken.find((l) => l.rolle === "ordner");
    expect(ordnerLuecke).toMatchObject({ vorhanden: 1, bedarf: 2 });
    const kioskLuecke = luecken.find((l) => l.rolle === "kioskdienst");
    expect(kioskLuecke).toMatchObject({ vorhanden: 0, bedarf: 1 });
  });

  it("meldet keine Lücke, wenn der Bedarf vollständig gedeckt ist", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: null };
    const luecken = berechneUnbesetzteDienste(
      verein,
      [termin],
      [
        { terminId: "t1", funktionstraegerTyp: "ordner" },
        { terminId: "t1", funktionstraegerTyp: "ordner" },
        { terminId: "t1", funktionstraegerTyp: "kioskdienst" },
      ]
    );

    expect(luecken).toHaveLength(0);
  });

  it("ignoriert Termin-Typen ohne konfigurierten Bedarf (0)", () => {
    const termin = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "turnier", ort: null };
    const luecken = berechneUnbesetzteDienste(verein, [termin], []);
    expect(luecken).toHaveLength(0);
  });

  it("sortiert Lücken nach Startzeit", () => {
    const spaeter = { id: "t2", start: new Date("2026-09-05T10:00:00Z"), typ: "testspiel", ort: null };
    const frueher = { id: "t1", start: new Date("2026-09-01T10:00:00Z"), typ: "testspiel", ort: null };
    const luecken = berechneUnbesetzteDienste(verein, [spaeter, frueher], []);
    expect(luecken[0].terminId).toBe("t1");
  });
});
