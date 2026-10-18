import { describe, expect, it } from "vitest";
import { ROADMAP, ROADMAP_STAND, STATUS_LABEL } from "./roadmap";

describe("Roadmap", () => {
  it("Stand ist ein gültiges Datum (YYYY-MM-DD) und nicht in der Zukunft", () => {
    expect(ROADMAP_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(`${ROADMAP_STAND}T12:00:00Z`);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  });

  it("Phasen haben eindeutige Ids, Ziel und Punkte; Status und Titel sind gültig", () => {
    const ids = ROADMAP.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const phase of ROADMAP) {
      expect(phase.titel.trim()).not.toBe("");
      expect(phase.ziel.trim()).not.toBe("");
      expect(phase.punkte.length).toBeGreaterThan(0);
      const titel = phase.punkte.map((p) => p.titel);
      expect(new Set(titel).size).toBe(titel.length);
      for (const punkt of phase.punkte) {
        expect(Object.keys(STATUS_LABEL)).toContain(punkt.status);
      }
    }
  });

  it("Vereinsverwaltung hat kein Datum (keine Zusagen), nur die begonnene Mitgliederverwaltung ist mehr als eine Idee", () => {
    const verwaltung = ROADMAP.find((p) => p.id === "vereinsverwaltung")!;
    expect(verwaltung.zeitraum).toMatch(/nicht terminiert/);
    const nichtIdee = verwaltung.punkte.filter((p) => p.status !== "idee").map((p) => p.titel);
    expect(nichtIdee).toEqual(["Mitgliederverwaltung"]);
  });
});
