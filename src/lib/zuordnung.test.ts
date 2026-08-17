import { describe, expect, it } from "vitest";
import { mehrfachZuordnungsMailInhalt, zuordnungsMailInhalt } from "./zuordnung";
import { zeileText } from "./email-layout";

describe("zuordnungsMailInhalt", () => {
  it("nennt die zugeordnete Rolle in der Überschrift", () => {
    const inhalt = zuordnungsMailInhalt("zeitnehmer", {
      start: new Date("2026-09-01T18:00:00+02:00"),
      ort: "Halle 1",
      beschreibung: null,
    });
    expect(inhalt.ueberschrift).toContain("Zeitnehmer");
  });

  it("fällt bei unbekannter Rolle auf den Rohwert zurück", () => {
    const inhalt = zuordnungsMailInhalt("unbekannteRolle", {
      start: new Date("2026-09-01T18:00:00+02:00"),
      ort: null,
      beschreibung: null,
    });
    expect(inhalt.ueberschrift).toContain("unbekannteRolle");
  });

  it("enthält Ort und Beschreibung als eigene Zeilen, wenn vorhanden", () => {
    const inhalt = zuordnungsMailInhalt("schiedsrichter", {
      start: new Date("2026-09-01T18:00:00+02:00"),
      ort: "Halle 1",
      beschreibung: "Herren 1 vs. Herren 2",
    });
    expect(inhalt.zeilen).toContainEqual(expect.stringContaining("Halle 1"));
    expect(inhalt.zeilen).toContain("Herren 1 vs. Herren 2");
  });
});

describe("mehrfachZuordnungsMailInhalt", () => {
  it("nennt die Anzahl Termine in der Überschrift ab dem zweiten Termin", () => {
    const inhalt = mehrfachZuordnungsMailInhalt("zeitnehmer", [
      { start: new Date("2026-09-01T18:00:00+02:00"), ort: null, beschreibung: null },
      { start: new Date("2026-09-08T18:00:00+02:00"), ort: null, beschreibung: null },
    ]);
    expect(inhalt.ueberschrift).toContain("2 Termine");
  });

  it("verwendet die Einzahl-Formulierung bei genau einem Termin", () => {
    const inhalt = mehrfachZuordnungsMailInhalt("sekretaer", [
      { start: new Date("2026-09-01T18:00:00+02:00"), ort: null, beschreibung: null },
    ]);
    expect(inhalt.ueberschrift).not.toContain("Termine");
    expect(inhalt.ueberschrift).toContain("Sekretär");
  });

  it("hebt das Datum jedes Termins als eigene, fette Zeile hervor und markiert ab dem zweiten Termin eine neue Gruppe", () => {
    const inhalt = mehrfachZuordnungsMailInhalt("zeitnehmer", [
      { start: new Date("2026-09-01T18:00:00+02:00"), ort: "Halle 1", beschreibung: "Herren 1 vs. Herren 2" },
      { start: new Date("2026-09-08T18:00:00+02:00"), ort: "Halle 2", beschreibung: null },
    ]);

    const datumZeilen = inhalt.zeilen.filter(
      (z) => typeof z !== "string" && z.stark
    );
    expect(datumZeilen).toHaveLength(2);
    expect(datumZeilen[0]).toMatchObject({ neueGruppe: false });
    expect(datumZeilen[1]).toMatchObject({ neueGruppe: true });

    expect(inhalt.zeilen.map(zeileText)).toContainEqual(
      expect.stringContaining("Halle 1")
    );
    expect(inhalt.zeilen.map(zeileText)).toContainEqual(
      expect.stringContaining("Halle 2")
    );
  });
});
