import { describe, expect, it } from "vitest";
import { zuordnungsMailInhalt } from "./zuordnung";

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
