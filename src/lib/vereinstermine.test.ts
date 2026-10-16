import { describe, expect, it } from "vitest";
import {
  aenderungen,
  antwortNochMoeglich,
  darfVereinsterminSehen,
  fasseAntwortenZusammen,
  istAnstehend,
  pruefeVereinstermin,
  type TerminEingabe,
} from "./vereinstermine";

const person = (userId: string, rollenTypen: string[] = [], istAdmin = false) => ({ userId, istAdmin, rollenTypen });

describe("darfVereinsterminSehen", () => {
  it("alle: jede Person, admins: nur Admins", () => {
    expect(darfVereinsterminSehen({ sichtbarkeit: "alle", rollen: [], personen: [] }, person("u1"))).toBe(true);
    expect(darfVereinsterminSehen({ sichtbarkeit: "admins", rollen: [], personen: [] }, person("u1", ["trainer"]))).toBe(false);
    expect(darfVereinsterminSehen({ sichtbarkeit: "admins", rollen: [], personen: [] }, person("u2", [], true))).toBe(true);
  });
  it("Admins sehen auch Auswahl-Termine, an denen sie nicht beteiligt sind", () => {
    expect(darfVereinsterminSehen({ sichtbarkeit: "auswahl", rollen: ["trainer"], personen: [] }, person("a", [], true))).toBe(true);
  });
  it("auswahl: Rolle oder namentlich gewählt", () => {
    const t = { sichtbarkeit: "auswahl", rollen: ["trainer", "zeitnehmer_sekretaer"], personen: ["p1"] };
    expect(darfVereinsterminSehen(t, person("x", ["trainer"]))).toBe(true);
    expect(darfVereinsterminSehen(t, person("x", ["sekretaer"]))).toBe(true); // Zeitnehmer/Sekretär ist EINE Auswahl
    expect(darfVereinsterminSehen(t, person("p1", []))).toBe(true);
    expect(darfVereinsterminSehen(t, person("x", ["ordner"]))).toBe(false);
    expect(darfVereinsterminSehen(t, person("x", []))).toBe(false);
  });
  it("auswahl: Warte als Gruppe, unbekannte Rollenschlüssel zählen nie", () => {
    expect(darfVereinsterminSehen({ sichtbarkeit: "auswahl", rollen: ["warte"], personen: [] }, person("x", ["ordnerwart"]))).toBe(true);
    expect(darfVereinsterminSehen({ sichtbarkeit: "auswahl", rollen: ["gibtsnicht"], personen: [] }, person("x", ["gibtsnicht"]))).toBe(false);
  });
  it("unbekannte Sichtbarkeit sieht nur ein Admin", () => {
    expect(darfVereinsterminSehen({ sichtbarkeit: "komisch", rollen: [], personen: [] }, person("x"))).toBe(false);
  });
});

describe("pruefeVereinstermin", () => {
  const ok: TerminEingabe = {
    titel: "  Vorstandssitzung ",
    art: "sitzung",
    beschreibung: "",
    ort: " Vereinsheim ",
    start: new Date("2026-11-05T18:00:00Z"),
    ende: new Date("2026-11-05T20:00:00Z"),
    sichtbarkeit: "alle",
    rollen: ["trainer"],
    personen: ["p1"],
  };
  it("bereinigt Eingaben und verwirft Auswahl bei sichtbarkeit alle", () => {
    const r = pruefeVereinstermin(ok);
    expect(r).toEqual({
      wert: expect.objectContaining({ titel: "Vorstandssitzung", ort: "Vereinsheim", beschreibung: null, rollen: [], personen: [], sichtbarkeit: "alle" }),
    });
  });
  it("Auswahl braucht mindestens eine Rolle oder Person; unbekannte Rollen fallen weg", () => {
    expect(pruefeVereinstermin({ ...ok, sichtbarkeit: "auswahl", rollen: ["quatsch"], personen: [] })).toEqual({ fehler: expect.stringMatching(/Rolle oder Person/) });
    const r = pruefeVereinstermin({ ...ok, sichtbarkeit: "auswahl", rollen: ["trainer", "trainer", "quatsch"], personen: ["p1", "p1", ""] });
    expect(r).toEqual({ wert: expect.objectContaining({ rollen: ["trainer"], personen: ["p1"] }) });
  });
  it("lehnt leeren Titel, fehlenden Beginn, Ende vor Beginn und unbekannte Werte ab", () => {
    expect(pruefeVereinstermin({ ...ok, titel: "  " })).toHaveProperty("fehler");
    expect(pruefeVereinstermin({ ...ok, titel: "x".repeat(121) })).toHaveProperty("fehler");
    expect(pruefeVereinstermin({ ...ok, start: null })).toHaveProperty("fehler");
    expect(pruefeVereinstermin({ ...ok, ende: new Date("2026-11-05T17:00:00Z") })).toHaveProperty("fehler");
    expect(pruefeVereinstermin({ ...ok, art: "x" })).toHaveProperty("fehler");
    expect(pruefeVereinstermin({ ...ok, sichtbarkeit: "x" })).toHaveProperty("fehler");
  });
  it("Ende ist optional", () => {
    expect(pruefeVereinstermin({ ...ok, ende: null })).toEqual({ wert: expect.objectContaining({ ende: null }) });
  });
});

describe("Antworten", () => {
  it("zählt Antworten und offene Personen der Zielgruppe", () => {
    const z = fasseAntwortenZusammen(["a", "b", "c", "d"], [
      { userId: "a", antwort: "zusage" },
      { userId: "b", antwort: "absage" },
      { userId: "zz", antwort: "vielleicht" }, // nicht mehr in der Zielgruppe
      { userId: "c", antwort: "kaputt" }, // ungültig: ignoriert
    ]);
    expect(z).toEqual({ zusage: 1, vielleicht: 1, absage: 1, offen: 2 });
  });
  it("Antworten nur vor Beginn", () => {
    const jetzt = new Date("2026-11-05T12:00:00Z");
    expect(antwortNochMoeglich(new Date("2026-11-05T12:00:01Z"), jetzt)).toBe(true);
    expect(antwortNochMoeglich(new Date("2026-11-05T12:00:00Z"), jetzt)).toBe(false);
  });
});

describe("aenderungen", () => {
  const alt = { titel: "Sitzung", start: new Date("2026-11-05T18:00:00Z"), ende: null, ort: "Vereinsheim" };
  it("meldet nur, was sich geändert hat", () => {
    expect(aenderungen(alt, { ...alt })).toEqual([]);
    expect(aenderungen(alt, { ...alt, start: new Date("2026-11-06T18:00:00Z"), ort: "Halle" })).toEqual(["Beginn", "Ort"]);
    expect(aenderungen(alt, { ...alt, ende: new Date("2026-11-05T20:00:00Z"), titel: "Vorstand" })).toEqual(["Titel", "Ende"]);
  });
  it("Ort leer = null gilt als gleich", () => {
    expect(aenderungen({ ...alt, ort: null }, { ...alt, ort: "" })).toEqual([]);
  });
});

describe("istAnstehend", () => {
  const jetzt = new Date("2026-11-05T19:00:00Z");
  it("laufender Termin bleibt, vorbeigegangener nicht", () => {
    expect(istAnstehend({ start: new Date("2026-11-05T18:00:00Z"), ende: new Date("2026-11-05T20:00:00Z") }, jetzt)).toBe(true);
    expect(istAnstehend({ start: new Date("2026-11-05T16:00:00Z"), ende: new Date("2026-11-05T18:00:00Z") }, jetzt)).toBe(false);
  });
  it("ohne Ende zwei Stunden Spielraum", () => {
    expect(istAnstehend({ start: new Date("2026-11-05T17:30:00Z"), ende: null }, jetzt)).toBe(true);
    expect(istAnstehend({ start: new Date("2026-11-05T16:30:00Z"), ende: null }, jetzt)).toBe(false);
  });
});
