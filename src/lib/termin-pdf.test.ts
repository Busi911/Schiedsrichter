import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, withTenant: vi.fn() }));

import { terminAlsPdf } from "./termin-pdf";

// Nur Rauchtest: lange Namen und alle Rollen dürfen nicht abstürzen oder ins Leere laufen; Umbrüche und
// Seitenwechsel werden gerechnet (das Aussehen prüft man am erzeugten PDF).
function zeile(i: number) {
  return {
    start: new Date(`2026-11-${String(10 + (i % 10)).padStart(2, "0")}T10:00:00Z`),
    typ: "testspiel",
    ort: "Sporthalle am Stadtpark Gießen-Wieseck (Halle 2)",
    mannschaftName: "HSG Wettenberg/Krofdorf-Gleiberg männliche Jugend C (Spielgemeinschaft)",
    schiedsrichterName: "Maximilian Mustermann-Beispiel / Johanna Musterfrau-Beispiel",
    ordnerName: "Ordner Ordnerlich",
    kioskdienstName: null,
    kassiererName: null,
    zeitnehmerName: "Zeit Nehmer",
    sekretaerName: null,
    eigeneDiensteText: "Fahrer: Anna Beispiel; Kuchen: Bernd Beispiel",
    rollenBedarf: { ordner: true, kioskdienst: true, kassierer: true, zeitnehmer: true, sekretaer: true },
  };
}

describe("terminAlsPdf", () => {
  it("erzeugt ein PDF auch mit langen Namen, allen Rollen und vielen Seiten", async () => {
    const zeilen = Array.from({ length: 80 }, (_, i) => zeile(i));
    const pdf = await terminAlsPdf(
      zeilen as never,
      ["schiedsrichter", "ordner", "kioskdienst", "kassierer", "zeitnehmer", "sekretaer", "eigeneDienste"],
      "Test Verein"
    );
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
  });
  it("leere Liste ergibt ein PDF mit Hinweis", async () => {
    const pdf = await terminAlsPdf([], undefined, "Test Verein");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
