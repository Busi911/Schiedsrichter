import { describe, expect, it } from "vitest";
import { datumDeutsch, datumText, feldFuerKopf, geschlechtText, planeImport, statusText, zelleSicher, type RohZeile } from "./mitglieder-import";

const HEUTE = "2026-10-18";
const zeile = (nr: number, felder: RohZeile["felder"]): RohZeile => ({ zeilenNr: nr, felder });

describe("Umwandlungen", () => {
  it("Datum: deutsch, ISO, Date, leer, Unsinn", () => {
    expect(datumText("5.3.1990")).toEqual({ wert: "1990-03-05" });
    expect(datumText("1990-03-05")).toEqual({ wert: "1990-03-05" });
    expect(datumText(new Date("1990-03-05T00:00:00Z"))).toEqual({ wert: "1990-03-05" });
    expect(datumText("")).toEqual({ wert: "" });
    expect(datumText("gestern")).toHaveProperty("fehler");
  });
  it("Geschlecht und Status", () => {
    expect(geschlechtText("Männlich")).toEqual({ wert: "m" });
    expect(geschlechtText("w.")).toEqual({ wert: "w" });
    expect(geschlechtText("")).toEqual({ wert: "" });
    expect(geschlechtText("?")).toHaveProperty("fehler");
    expect(statusText("")).toEqual({ wert: "aktiv" });
    expect(statusText("Ausgetreten")).toEqual({ wert: "ausgetreten" });
    expect(statusText("weg")).toHaveProperty("fehler");
  });
  it("Kopfzeilen mit Aliasen", () => {
    expect(feldFuerKopf(" Nachname ")).toBe("name");
    expect(feldFuerKopf("Art der  Mitgliedschaft")).toBe("art");
    expect(feldFuerKopf("E-Mail")).toBe("email");
    expect(feldFuerKopf("Mannschaften")).toBeNull();
  });
  it("Export: Datum deutsch, Formeln entschärft", () => {
    expect(datumDeutsch("1990-03-05")).toBe("05.03.1990");
    expect(datumDeutsch(null)).toBe("");
    expect(zelleSicher("=SUMME(A1)")).toBe("'=SUMME(A1)");
    expect(zelleSicher("Max")).toBe("Max");
  });
});

describe("planeImport", () => {
  const kontext = {
    vorhandene: [{ id: "1", vorname: "Max", name: "Müller", email: "max@x.de", userId: null }],
    arten: [{ name: "Fördermitglied" }],
    heute: HEUTE,
  };
  it("legt Gültige an, überspringt Doppelte (vorhanden und in der Datei), meldet Fehler", () => {
    const plan = planeImport(
      [
        zeile(2, { vorname: "Anna", name: "Meier", email: "anna@x.de", art: "fördermitglied", geburtsdatum: "01.02.1980" }),
        zeile(3, { vorname: "Max", name: "Mueller", email: "MAX@x.de" }),
        zeile(4, { vorname: "Anna", name: "Meier", email: "anna@x.de" }),
        zeile(5, { vorname: "", name: "Ohne" }),
        zeile(6, { vorname: "Tim", name: "Roth", geburtsdatum: "kaputt" }),
        zeile(7, { vorname: "Eva", name: "Klein", art: "Gönner" }),
        zeile(8, { vorname: "Uwe", name: "Lang", art: "gönner", status: "passiv" }),
      ],
      kontext
    );
    expect(plan.neu.map((n) => n.zeilenNr)).toEqual([2, 7, 8]);
    expect(plan.neu[0]).toMatchObject({ artName: "Fördermitglied", wert: { vorname: "Anna", geburtsdatum: "1980-02-01" } });
    expect(plan.neu[2].wert.status).toBe("passiv");
    expect(plan.uebersprungen.map((u) => u.zeilenNr)).toEqual([3, 4]);
    expect(plan.fehler.map((f) => f.zeilenNr)).toEqual([5, 6]);
    expect(plan.neueArten).toEqual(["Gönner"]);
    expect(plan.neu[1].artName).toBe("Gönner");
    expect(plan.neu[2].artName).toBe("Gönner");
  });
  it("Zeilenlimit", () => {
    const viele = Array.from({ length: 2001 }, (_, i) => zeile(i + 2, { vorname: "A", name: `B${i}` }));
    expect(planeImport(viele, kontext).fehler[0].grund).toContain("Zu viele");
  });
});
