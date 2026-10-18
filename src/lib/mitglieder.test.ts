import { describe, expect, it } from "vitest";
import { filtereMitglieder, heuteBerlin, pruefeMitglied, zaehleNachStatus, type MitgliedEingabe } from "./mitglieder";

const leer: MitgliedEingabe = { name: "", vorname: "", geburtsdatum: "", email: "", telefon: "", geschlecht: "", status: "", eintrittsdatum: "", austrittsdatum: "", bemerkung: "" };
const HEUTE = "2026-10-18";

describe("pruefeMitglied", () => {
  it("verlangt Vor- und Nachname", () => {
    expect(pruefeMitglied({ ...leer, name: "Muster" }, HEUTE)).toHaveProperty("fehler");
    expect(pruefeMitglied({ ...leer, vorname: "Max" }, HEUTE)).toHaveProperty("fehler");
  });
  it("nimmt nur Namen und setzt Standard aktiv", () => {
    const r = pruefeMitglied({ ...leer, name: " Muster ", vorname: "Max" }, HEUTE);
    expect(r).toEqual({ wert: expect.objectContaining({ name: "Muster", vorname: "Max", status: "aktiv", email: null, austrittsdatum: null }) });
  });
  it("lehnt ungültige Adresse, Datum, Zukunft und Status ab", () => {
    const basis = { ...leer, name: "A", vorname: "B" };
    expect(pruefeMitglied({ ...basis, email: "kein-at" }, HEUTE)).toHaveProperty("fehler");
    expect(pruefeMitglied({ ...basis, geburtsdatum: "2026-02-30" }, HEUTE)).toHaveProperty("fehler");
    expect(pruefeMitglied({ ...basis, geburtsdatum: "2027-01-01" }, HEUTE)).toHaveProperty("fehler");
    expect(pruefeMitglied({ ...basis, status: "weg" }, HEUTE)).toHaveProperty("fehler");
    expect(pruefeMitglied({ ...basis, geschlecht: "x" }, HEUTE)).toHaveProperty("fehler");
  });
  it("ausgetreten bekommt heute als Austritt, andere Stati keinen", () => {
    const basis = { ...leer, name: "A", vorname: "B" };
    expect(pruefeMitglied({ ...basis, status: "ausgetreten" }, HEUTE)).toEqual({ wert: expect.objectContaining({ austrittsdatum: HEUTE }) });
    expect(pruefeMitglied({ ...basis, status: "passiv", austrittsdatum: "2026-01-01" }, HEUTE)).toEqual({ wert: expect.objectContaining({ austrittsdatum: null }) });
  });
  it("Austritt vor Eintritt ist ein Fehler", () => {
    expect(pruefeMitglied({ ...leer, name: "A", vorname: "B", status: "ausgetreten", eintrittsdatum: "2020-05-01", austrittsdatum: "2019-01-01" }, HEUTE)).toHaveProperty("fehler");
  });
});

describe("Liste", () => {
  const liste = [
    { name: "Meier", vorname: "Anna", email: "anna@x.de", status: "aktiv" },
    { name: "Albers", vorname: "Bernd", email: null, status: "passiv" },
    { name: "Müller", vorname: "Anna", email: null, status: "ausgetreten" },
  ];
  it("sucht über Vor-/Nachname und E-Mail, sortiert nach Nachname", () => {
    expect(filtereMitglieder(liste, "", "").map((m) => m.name)).toEqual(["Albers", "Meier", "Müller"]);
    expect(filtereMitglieder(liste, "anna", "").map((m) => m.name)).toEqual(["Meier", "Müller"]);
    expect(filtereMitglieder(liste, "meier anna", "")).toHaveLength(1);
    expect(filtereMitglieder(liste, "x.de", "")).toHaveLength(1);
  });
  it("filtert nach Status und ignoriert unbekannte Werte", () => {
    expect(filtereMitglieder(liste, "", "passiv")).toHaveLength(1);
    expect(filtereMitglieder(liste, "", "alle")).toHaveLength(3);
  });
  it("zählt je Status", () => {
    expect(zaehleNachStatus(liste)).toEqual({ aktiv: 1, passiv: 1, ausgetreten: 1 });
  });
  it("heuteBerlin liefert YYYY-MM-DD", () => {
    expect(heuteBerlin(new Date("2026-10-18T22:30:00Z"))).toBe("2026-10-19");
  });
});
