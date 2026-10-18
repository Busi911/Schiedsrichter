import { describe, expect, it } from "vitest";
import { ergaenzeName, findeMitglied, offeneUeberfuehrung, planeUeberfuehrung, teileName, type KontoPerson, type MitgliedKurz } from "./mitglieder-ueberfuehrung";

const person = (userId: string, name: string | null, email: string, aktiv = true): KontoPerson => ({ userId, name, email, telefon: null, aktiv });
const mitglied = (id: string, vorname: string, name: string, email: string | null = null, userId: string | null = null): MitgliedKurz => ({ id, vorname, name, email, userId });

describe("teileName", () => {
  it.each([
    ["Max Muster", "Max", "Muster"],
    ["Anna Maria Muster", "Anna Maria", "Muster"],
    ["Anna von der Heide", "Anna", "von der Heide"],
    ["Muster, Max", "Max", "Muster"],
    ["  Max   Muster ", "Max", "Muster"],
  ])("%s", (voll, vorname, name) => expect(teileName(voll)).toEqual({ vorname, name }));
  it("liefert null für leere oder einzelne Namen", () => {
    expect(teileName(null)).toBeNull();
    expect(teileName("Cher")).toBeNull();
    expect(teileName("Muster,")).toBeNull();
  });
});

describe("findeMitglied", () => {
  const liste = [mitglied("1", "Max", "Müller", "max@x.de"), mitglied("2", "Anna", "Meier", null), mitglied("3", "Eva", "Klein", "eva@x.de", "u9")];
  it("gleiches Konto: bereits", () => {
    expect(findeMitglied({ userId: "u9", vorname: "X", name: "Y", email: null }, liste)?.art).toBe("bereits");
  });
  it("gleiche E-Mail (Schreibweise egal): verknüpfen", () => {
    expect(findeMitglied({ userId: "u1", vorname: "Maximilian", name: "Mueller", email: " MAX@x.de" }, liste)).toMatchObject({ art: "verknuepfen", grund: "email" });
  });
  it("gleicher Name (Umlaut/Schreibweise egal) ohne Adresse im Mitglied: verknüpfen", () => {
    expect(findeMitglied({ userId: "u2", vorname: "anna", name: "MEIER", email: "anna@x.de" }, liste)).toMatchObject({ art: "verknuepfen", grund: "name" });
  });
  it("gleicher Name mit anderer Adresse: nachfragen, nicht anlegen", () => {
    expect(findeMitglied({ userId: "u3", vorname: "Max", name: "Müller", email: "anderes@x.de" }, liste)?.art).toBe("pruefen");
  });
  it("gleicher Name, aber anderes Konto verknüpft: nachfragen", () => {
    expect(findeMitglied({ userId: "u4", vorname: "Eva", name: "Klein", email: null }, liste)?.art).toBe("pruefen");
  });
  it("verschiedene Geburtsdaten sind verschiedene Personen", () => {
    const l = [{ ...mitglied("5", "Tim", "Roth"), geburtsdatum: "2010-01-01" }];
    expect(findeMitglied({ vorname: "Tim", name: "Roth", email: null, geburtsdatum: "1980-05-05" }, l)).toBeNull();
    expect(findeMitglied({ vorname: "Tim", name: "Roth", email: null, geburtsdatum: "2010-01-01" }, l)?.art).toBe("verknuepfen");
  });
  it("kein Treffer", () => {
    expect(findeMitglied({ vorname: "Neu", name: "Person", email: "n@x.de" }, liste)).toBeNull();
  });
});

describe("planeUeberfuehrung", () => {
  it("legt neue an, verknüpft Treffer, meldet Unvollständige und Zweifelsfälle", () => {
    const personen = [
      person("a", "Neu Person", "neu@x.de"),
      person("b", "Max Müller", "max@x.de"),
      person("c", "Anna Meier", "anna@x.de"),
      person("d", "Einname", "e@x.de"),
      person("e", "Eva Klein", "eva-neu@x.de"),
    ];
    const mitglieder = [mitglied("1", "Max", "Müller", "max@x.de"), mitglied("2", "Anna", "Meier"), mitglied("3", "Eva", "Klein", "eva@x.de", "u9")];
    const plan = planeUeberfuehrung(personen, mitglieder);
    expect(plan.neu.map((n) => n.person.userId)).toEqual(["a"]);
    expect(plan.verknuepfen).toEqual([
      { userId: "b", mitgliedId: "1", grund: "email" },
      { userId: "c", mitgliedId: "2", grund: "name" },
    ]);
    expect(plan.unvollstaendig.map((p) => p.userId)).toEqual(["d"]);
    expect(plan.pruefen.map((p) => p.person.userId)).toEqual(["e"]);
    expect(offeneUeberfuehrung(plan)).toBe(5);
  });
  it("ist idempotent: bereits verknüpfte Konten brauchen nichts", () => {
    const plan = planeUeberfuehrung([person("a", "Max Muster", "m@x.de"), person("b", null, "b@x.de")], [mitglied("1", "Max", "Muster", "m@x.de", "a"), mitglied("2", "B", "B", null, "b")]);
    expect(plan.bereits).toBe(2);
    expect(offeneUeberfuehrung(plan)).toBe(0);
  });
  it("zwei Konten mit gleichem Namen ergeben nur ein neues Mitglied, das zweite wird geprüft", () => {
    const plan = planeUeberfuehrung([person("a", "Tim Roth", "t1@x.de"), person("b", "Tim Roth", "t2@x.de")], []);
    expect(plan.neu).toHaveLength(1);
    expect(plan.pruefen).toHaveLength(1);
  });
});

describe("ergaenzeName", () => {
  it("ein Wort ist der Vorname, es fehlt nur der Nachname", () => {
    expect(ergaenzeName("Anika", "", " Muster ")).toEqual({ name: "Anika Muster" });
    expect(ergaenzeName("Anika", "ignoriert", "von der Heide")).toEqual({ name: "Anika von der Heide" });
  });
  it("ohne Namen oder mit mehreren Wörtern braucht es beide Angaben", () => {
    expect(ergaenzeName(null, "", "Muster")).toHaveProperty("fehler");
    expect(ergaenzeName(null, "Max", "Muster")).toEqual({ name: "Max Muster" });
    expect(ergaenzeName("Muster, ", "Max", "Muster")).toEqual({ name: "Max Muster" });
  });
  it("lehnt Leeres, Komma und Überlanges ab", () => {
    expect(ergaenzeName("Anika", "", "  ")).toHaveProperty("fehler");
    expect(ergaenzeName("Anika", "", "Muster,x")).toHaveProperty("fehler");
    expect(ergaenzeName("Anika", "", "x".repeat(101))).toHaveProperty("fehler");
  });
});
