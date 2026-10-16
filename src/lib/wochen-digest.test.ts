import { describe, expect, it } from "vitest";
import { digestInhalt, istDigestNeuigkeit } from "./wochen-digest";
import { zeileText } from "./email-layout";
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
    const indexErsterTag = inhalt.zeilen.findIndex((z) =>
      zeileText(z).includes("September")
    );
    expect(indexErsterTag).toBeGreaterThanOrEqual(0);
    expect(zeileText(inhalt.zeilen[0])).toContain("1. September");
  });

  it("enthält Zeit, Typ und Zusatzinfos pro Eintrag", () => {
    const eintraegeProTag = new Map<string, KalenderEintrag[]>([
      ["2026-09-01", [eintrag]],
    ]);
    const inhalt = digestInhalt("Musterverein", eintraegeProTag);
    const eintragZeile = zeileText(
      inhalt.zeilen.find((z) => zeileText(z).includes("18:00"))!
    );
    expect(eintragZeile).toContain("Rundenspiel");
    expect(eintragZeile).toContain("Herren 1");
    expect(eintragZeile).toContain("Halle 1");
  });

  it("verlinkt auf /profil als CTA", () => {
    const inhalt = digestInhalt("Musterverein", new Map([["2026-09-01", [eintrag]]]));
    expect(inhalt.cta?.url).toContain("/profil");
  });
});

describe("Training und Vereinstermine in der Wochenübersicht", () => {
  const training: KalenderEintrag = { id: "tr1", art: "training", zeit: "18:00", label: "Herren (Mä)", typLabel: "Training bis 19:30 Uhr", ort: "Sporthalle, Nord" };
  const sitzung: KalenderEintrag = { id: "v1", art: "vereinstermin", zeit: "19:00", label: "Trainersitzung", typLabel: "Sitzung · jeden 4. Donnerstag im Monat", ort: "Vereinsheim" };

  it("zeigt Trainings mit Mannschaft und Ort, ein ausfallendes deutlich markiert", () => {
    const inhalt = digestInhalt("Musterverein", new Map([["2026-09-01", [training, { ...training, id: "tr2", zeit: "20:00", ausgefallen: true }]]]));
    const zeilen = inhalt.zeilen.map(zeileText);
    expect(zeilen.find((z) => z.includes("18:00"))).toContain("Training Herren (Mä) (Sporthalle, Nord)");
    expect(zeilen.find((z) => z.includes("20:00"))).toContain("FÄLLT AUS");
  });

  it("zeigt Vereinstermine mit Art, Titel und Ort", () => {
    const inhalt = digestInhalt("Musterverein", new Map([["2026-09-01", [sitzung]]]));
    expect(zeileText(inhalt.zeilen.find((z) => zeileText(z).includes("19:00"))!)).toBe("  19:00 · Sitzung · jeden 4. Donnerstag im Monat: Trainersitzung (Vereinsheim)");
  });

  it("reguläre Trainings allein sind keine Neuigkeit, Vereinstermine, ausfallende Trainings und Spiele schon", () => {
    expect(istDigestNeuigkeit(training)).toBe(false);
    expect(istDigestNeuigkeit({ ...training, ausgefallen: true })).toBe(true);
    expect(istDigestNeuigkeit(sitzung)).toBe(true);
    expect(istDigestNeuigkeit(eintrag)).toBe(true);
  });
});
