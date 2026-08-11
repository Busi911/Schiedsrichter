import { describe, expect, it } from "vitest";
import { istSaisonAbgeschlossen, saisonLabel, saisonSortKey } from "./saison";

describe("saisonLabel", () => {
  it("ordnet Juli einem Jahres als Saisonstart zu", () => {
    expect(saisonLabel(new Date(2025, 6, 1))).toBe("2025/26");
  });

  it("ordnet Monate vor Saisonende (23.06.) der laufenden Saison zu", () => {
    expect(saisonLabel(new Date(2026, 2, 15))).toBe("2025/26");
    expect(saisonLabel(new Date(2026, 5, 23))).toBe("2025/26");
  });

  it("ordnet den 24.06. bereits der neuen Saison zu", () => {
    expect(saisonLabel(new Date(2026, 5, 24))).toBe("2026/27");
  });

  it("ordnet August korrekt der neuen Saison zu", () => {
    expect(saisonLabel(new Date(2026, 7, 1))).toBe("2026/27");
  });

  it("rollt den Jahrhundertwechsel bei der Kurzform korrekt", () => {
    expect(saisonLabel(new Date(2099, 6, 1))).toBe("2099/00");
  });
});

describe("saisonSortKey", () => {
  it("liefert das Startjahr als sortierbare Zahl", () => {
    expect(saisonSortKey("2025/26")).toBe(2025);
    expect(saisonSortKey("2099/00")).toBe(2099);
  });
});

describe("istSaisonAbgeschlossen", () => {
  const laufendeSaison = new Date(2026, 2, 1); // März 2026 -> Saison 2025/26 läuft noch

  it("ist false für Termine in der laufenden Saison", () => {
    expect(istSaisonAbgeschlossen(new Date(2025, 8, 1), laufendeSaison)).toBe(
      false
    );
  });

  it("ist true für Termine aus einer bereits beendeten Saison", () => {
    expect(istSaisonAbgeschlossen(new Date(2024, 8, 1), laufendeSaison)).toBe(
      true
    );
  });

  it("wechselt genau am 24.06. auf die neue, noch laufende Saison", () => {
    const saisonende = new Date(2026, 5, 23);
    const neueSaison = new Date(2026, 5, 24);
    expect(istSaisonAbgeschlossen(saisonende, neueSaison)).toBe(true);
    expect(istSaisonAbgeschlossen(neueSaison, neueSaison)).toBe(false);
  });
});
