import { describe, expect, it } from "vitest";
import {
  bedarfEigenerDienst,
  dienstwartStellen,
  eigeneDiensteZellenText,
  bedarfSchluessel,
  dienstGiltFuerTermin,
  eigeneDiensteFuerTermin,
  eigeneDiensteLuecken,
  geltungsText,
  pruefeBedarf,
  pruefeDienstName,
  veranstaltungsArt,
  type DienstArtRegel,
} from "./eigene-dienste";

const fahrer: DienstArtRegel = {
  id: "d1",
  name: "Fahrer",
  aktiv: true,
  bedarfHeim: 0,
  bedarfAuswaerts: 3,
  bedarfFreundschaft: 0,
  bedarfTurnier: 3,
  nurAusgewaehlteMannschaften: true,
  mannschaftIds: ["mJA"],
};
const kuchen: DienstArtRegel = {
  id: "d2",
  name: "Kuchen",
  aktiv: true,
  bedarfHeim: 2,
  bedarfAuswaerts: 0,
  bedarfFreundschaft: 2,
  bedarfTurnier: 1,
  nurAusgewaehlteMannschaften: false,
  mannschaftIds: [],
};

const heim = { id: "t1", typ: "rundenspiel", pflichtspiel: true, mannschaftId: "mJA" };
const auswaerts = { ...heim, id: "t2", typ: "auswaertsspiel" };

describe("veranstaltungsArt", () => {
  it("ordnet Termine wie die festen Dienste ein", () => {
    expect(veranstaltungsArt(heim)).toBe("heimspiel");
    expect(veranstaltungsArt(auswaerts)).toBe("auswaertsspiel");
    expect(veranstaltungsArt({ id: "x", typ: "testspiel" })).toBe("freundschaftsspiel");
    expect(veranstaltungsArt({ id: "x", typ: "turnier" })).toBe("turnier");
    expect(veranstaltungsArt({ id: "x", typ: "rundenspiel", pflichtspiel: false })).toBe("freundschaftsspiel");
    expect(veranstaltungsArt({ id: "x", typ: "rundenspiel", pflichtspiel: false, freundschaftsTyp: "turnier" })).toBe("turnier");
  });

  it("Turnier-Einzelspiele und persönliche Schiri-Einsätze haben keine eigenen Dienste", () => {
    expect(veranstaltungsArt({ id: "x", typ: "turnier_spiel" })).toBeNull();
    expect(veranstaltungsArt({ id: "x", typ: "spiel_ics" })).toBeNull();
  });
});

describe("dienstGiltFuerTermin / bedarfEigenerDienst", () => {
  it("Veranstaltungsart muss passen", () => {
    expect(dienstGiltFuerTermin(kuchen, heim)).toBe(true);
    expect(dienstGiltFuerTermin(kuchen, auswaerts)).toBe(false);
    expect(bedarfEigenerDienst(kuchen, heim)).toBe(2);
    expect(bedarfEigenerDienst(kuchen, auswaerts)).toBe(0);
  });

  it("nur ausgewählte Mannschaften", () => {
    expect(dienstGiltFuerTermin(fahrer, auswaerts)).toBe(true);
    expect(dienstGiltFuerTermin(fahrer, { ...auswaerts, mannschaftId: "Herren" })).toBe(false);
    expect(dienstGiltFuerTermin(fahrer, { ...auswaerts, mannschaftId: null })).toBe(false);
  });

  it("deaktivierter Dienst hat nie Bedarf, auch nicht mit Override", () => {
    const aus = { ...kuchen, aktiv: false };
    expect(dienstGiltFuerTermin(aus, heim)).toBe(false);
    expect(bedarfEigenerDienst(aus, heim, 5)).toBe(0);
  });

  it("Termin-Override geht vor (auch 0, auch wenn der Dienst sonst nicht gälte)", () => {
    expect(bedarfEigenerDienst(kuchen, heim, 0)).toBe(0);
    expect(bedarfEigenerDienst(kuchen, heim, 4)).toBe(4);
    expect(bedarfEigenerDienst(kuchen, auswaerts, 1)).toBe(1);
    expect(bedarfEigenerDienst(kuchen, heim, null)).toBe(2);
  });
});

describe("eigeneDiensteFuerTermin / eigeneDiensteLuecken", () => {
  const kontext = { arten: [fahrer, kuchen], overrides: new Map([[bedarfSchluessel("t2", "d1"), 2]]) };
  const zuordnungen = [
    { terminId: "t2", funktionstraegerTyp: "eigener_dienst", dienstArtId: "d1" },
    { terminId: "t2", funktionstraegerTyp: "eigener_dienst", dienstArtId: "d1" },
    { terminId: "t1", funktionstraegerTyp: "eigener_dienst", dienstArtId: "d2" },
    // feste Dienste zählen nie für eigene
    { terminId: "t1", funktionstraegerTyp: "ordner", dienstArtId: null },
  ];

  it("zählt nur Einteilungen desselben Dienstes am selben Termin", () => {
    expect(eigeneDiensteFuerTermin(kontext, heim, zuordnungen)).toEqual([
      { dienstArtId: "d2", name: "Kuchen", bedarf: 2, vorhanden: 1 },
    ]);
    expect(eigeneDiensteFuerTermin(kontext, auswaerts, zuordnungen)).toEqual([
      { dienstArtId: "d1", name: "Fahrer", bedarf: 2, vorhanden: 2 },
    ]);
  });

  it("Lücken: nur nicht voll besetzte", () => {
    expect(eigeneDiensteLuecken(kontext, heim, zuordnungen).map((s) => s.name)).toEqual(["Kuchen"]);
    expect(eigeneDiensteLuecken(kontext, auswaerts, zuordnungen)).toEqual([]);
  });

  it("ohne eigene Dienste: keine Stellen", () => {
    expect(eigeneDiensteFuerTermin({ arten: [], overrides: new Map() }, heim, zuordnungen)).toEqual([]);
  });
});

describe("Formularprüfung", () => {
  it("Name: bereinigt, nicht leer, nicht doppelt", () => {
    expect(pruefeDienstName("  Fahr   dienst ", [])).toBe("Fahr dienst");
    expect(() => pruefeDienstName("  ", [])).toThrow();
    expect(() => pruefeDienstName("fahrer", ["Fahrer"])).toThrow(/gibt es schon/);
    expect(() => pruefeDienstName("x".repeat(41), [])).toThrow();
  });

  it("Bedarf: ganze Zahl 0 bis 20", () => {
    expect(pruefeBedarf("3")).toBe(3);
    expect(pruefeBedarf("0")).toBe(0);
    expect(() => pruefeBedarf("-1")).toThrow();
    expect(() => pruefeBedarf("2.5")).toThrow();
    expect(() => pruefeBedarf("21")).toThrow();
    expect(() => pruefeBedarf("abc")).toThrow();
  });
});

describe("geltungsText", () => {
  it("beschreibt Bedarf je Veranstaltung und Mannschaften", () => {
    expect(geltungsText(fahrer, new Map([["mJA", "männl. A-Jugend"]]))).toBe("Auswärts 3 · Turnier 3 · nur männl. A-Jugend");
    expect(geltungsText(kuchen, new Map())).toBe("Heim 2 · Freundschaft 2 · Turnier 1");
    expect(geltungsText({ ...kuchen, bedarfHeim: 0, bedarfFreundschaft: 0, bedarfTurnier: 0 }, new Map())).toBe("nirgends gebraucht");
  });

  it("Bedarf je Veranstaltung: unterschiedliche Zahlen für Heim und Turnier", async () => {
    const { bedarfEigenerDienst } = await import("./eigene-dienste");
    expect(bedarfEigenerDienst(kuchen, { id: "h", typ: "rundenspiel", pflichtspiel: true })).toBe(2);
    expect(bedarfEigenerDienst(kuchen, { id: "t", typ: "turnier" })).toBe(1);
    expect(bedarfEigenerDienst(kuchen, { id: "a", typ: "auswaertsspiel" })).toBe(0);
  });
});

describe("dienstwartStellen", () => {
  const alle = [
    { id: "d1", name: "Fahrer", aktiv: true },
    { id: "d2", name: "Kuchen", aktiv: true },
    { id: "d3", name: "Alt", aktiv: false },
  ];
  const kontext = { arten: [fahrer, kuchen], overrides: new Map<string, number>() };
  const person = (dienstArtId: string, terminId = "t1") => ({
    zuordnungId: `z-${dienstArtId}`,
    terminId,
    dienstArtId,
    userId: null,
    anzeigeName: "Eva",
    ohneLogin: true,
  });

  it("zeigt nur geltende Dienste, mit Einteilungen", () => {
    const stellen = dienstwartStellen(kontext, alle, heim, [person("d2")]);
    expect(stellen.map((s) => [s.name, s.bedarf, s.eingeteilt.length])).toEqual([["Kuchen", 2, 1]]);
  });

  it("deaktivierter Dienst mit Einteilung bleibt sichtbar (Bedarf 0)", () => {
    const stellen = dienstwartStellen(kontext, alle, heim, [person("d3")]);
    expect(stellen.map((s) => [s.name, s.bedarf])).toEqual([
      ["Kuchen", 2],
      ["Alt", 0],
    ]);
  });

  it("auf 0 gesetzter Bedarf bleibt sichtbar, damit er wieder geändert werden kann", () => {
    const mitNull = { ...kontext, overrides: new Map([[bedarfSchluessel("t1", "d2"), 0]]) };
    expect(dienstwartStellen(mitNull, alle, heim, []).map((s) => [s.name, s.bedarf, s.override])).toEqual([["Kuchen", 0, 0]]);
  });

  it("Termin ohne geltende Dienste: keine Stellen", () => {
    expect(dienstwartStellen(kontext, alle, { id: "x", typ: "spiel_ics" }, [])).toEqual([]);
  });
});

describe("eigeneDiensteZellenText", () => {
  const p = (name: string) => ({ zuordnungId: name, terminId: "t", dienstArtId: "d", userId: null, anzeigeName: name, ohneLogin: true });
  it("fasst alle Dienste eines Termins in einer Zelle zusammen", () => {
    expect(
      eigeneDiensteZellenText([
        { dienstArtId: "d1", name: "Fahrer", bedarf: 3, override: null, fahrgemeinschaft: false, eingeteilt: [p("Eva"), p("Opa Heinz")] },
        { dienstArtId: "d2", name: "Kuchen", bedarf: 2, override: null, fahrgemeinschaft: false, eingeteilt: [] },
        { dienstArtId: "d3", name: "Aufbau", bedarf: 1, override: null, fahrgemeinschaft: false, eingeteilt: [p("Tom")] },
      ])
    ).toBe("Fahrer: Eva, Opa Heinz (2/3); Kuchen: offen; Aufbau: Tom");
  });
  it("Fahrgemeinschaft: Zahl der Mitfahrer je Fahrer", () => {
    expect(
      eigeneDiensteZellenText([
        {
          dienstArtId: "d1",
          name: "Fahrer",
          bedarf: 2,
          override: null,
          fahrgemeinschaft: true,
          eingeteilt: [{ ...p("Eva"), plaetze: 3, mitfahrer: [{ id: "m1", name: "Lena" }, { id: "m2", name: "Tim" }] }, p("Tom")],
        },
      ])
    ).toBe("Fahrer: Eva (+2 Mitfahrer), Tom");
  });
  it("ohne Bedarf und ohne Einteilung: nichts", () => {
    expect(eigeneDiensteZellenText([{ dienstArtId: "d", name: "Kuchen", bedarf: 0, override: 0, fahrgemeinschaft: false, eingeteilt: [] }])).toBeNull();
    expect(eigeneDiensteZellenText([])).toBeNull();
  });
});
