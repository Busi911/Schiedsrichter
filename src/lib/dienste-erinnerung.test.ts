import { describe, expect, it } from "vitest";
import { offenePostenInhalt, offenePostenZeile } from "./dienste-erinnerung";
import type { OffenePosten } from "./dashboard";

const posten: OffenePosten = {
  terminId: "t1",
  start: new Date("2026-09-01T10:00:00Z"),
  typ: "testspiel",
  ort: "Halle 1",
  mannschaftLabel: "Herren 1",
  luecken: [{ rolle: "zeitnehmer", vorhanden: 0, bedarf: 1 }],
};

describe("offenePostenZeile", () => {
  it("enthält Zeitpunkt, Mannschaft/Ort und die fehlende Rolle mit Zahlen", () => {
    const zeile = offenePostenZeile(posten);
    expect(zeile).toContain("Herren 1");
    expect(zeile).toContain("Halle 1");
    expect(zeile).toContain("Zeitnehmer/Sekretär 0/1");
  });

  it("lässt den Zusatz weg, wenn weder Mannschaft noch Ort bekannt sind", () => {
    const zeile = offenePostenZeile({ ...posten, mannschaftLabel: null, ort: null });
    expect(zeile).not.toContain("·");
  });
});

describe("offenePostenInhalt", () => {
  it("verwendet Singular in der Überschrift bei genau einem Termin", () => {
    const inhalt = offenePostenInhalt("Musterverein", [posten]);
    expect(inhalt.ueberschrift).toContain("1 Termin ");
    expect(inhalt.zeilen).toHaveLength(1);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/admin/dienste");
  });

  it("verwendet Plural bei mehreren Terminen", () => {
    const inhalt = offenePostenInhalt("Musterverein", [posten, posten]);
    expect(inhalt.ueberschrift).toContain("2 Termine");
    expect(inhalt.zeilen).toHaveLength(2);
  });
});
