import { describe, expect, it } from "vitest";
import { digestInhalt } from "./wochen-digest";
import type { KalenderEintrag } from "@/components/monats-kalender";

const eintrag: KalenderEintrag = {
  id: "t1",
  zeit: "18:00",
  label: "Herren 1 vs. Herren 2",
  typLabel: "Rundenspiel",
  ort: "Halle 1",
  mannschaftLabel: "Herren 1",
};

describe("digestInhalt", () => {
  it("zählt Einsätze über alle Tage zusammen und sortiert die Tage chronologisch", () => {
    const eintraegeProTag = new Map<string, KalenderEintrag[]>([
      ["2026-09-03", [eintrag]],
      ["2026-09-01", [eintrag, eintrag]],
    ]);

    const inhalt = digestInhalt("Musterverein", eintraegeProTag);

    expect(inhalt.ueberschrift).toContain("(3)");
    expect(inhalt.vereinName).toBe("Musterverein");
    // Tages-Überschrift für den 1. September muss vor der für den 3. stehen.
    const indexErsterTag = inhalt.zeilen.findIndex((z) => z.includes("September"));
    expect(indexErsterTag).toBeGreaterThanOrEqual(0);
    expect(inhalt.zeilen[0]).toContain("1. September");
  });

  it("enthält Zeit, Typ und Zusatzinfos pro Eintrag", () => {
    const eintraegeProTag = new Map<string, KalenderEintrag[]>([
      ["2026-09-01", [eintrag]],
    ]);
    const inhalt = digestInhalt("Musterverein", eintraegeProTag);
    const eintragZeile = inhalt.zeilen.find((z) => z.includes("18:00"));
    expect(eintragZeile).toContain("Rundenspiel");
    expect(eintragZeile).toContain("Herren 1");
    expect(eintragZeile).toContain("Halle 1");
  });

  it("verlinkt auf /profil als CTA", () => {
    const inhalt = digestInhalt("Musterverein", new Map([["2026-09-01", [eintrag]]]));
    expect(inhalt.cta?.url).toContain("/profil");
  });
});
