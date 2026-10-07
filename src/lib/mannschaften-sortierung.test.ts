import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("@/db", () => ({ withTenant: vi.fn(), db: {} }));

const m = (id: string, name: string, nummer: number, kategorie: string, altersklasse: string | null) =>
  ({ id, name, nummer, kategorie, altersklasse }) as never;

describe("Reihenfolge der Mannschaften", () => {
  it("Herren stehen nach Nummer, unabhängig von der Altersklasse der Quelle (Männer I vor II, III, IV)", async () => {
    const { gruppiereMannschaften } = await import("./liga-oeffentlich");
    const g = gruppiereMannschaften([
      m("2", "Männer II", 2, "herren", "Mä/männl."),
      m("1", "Männer I", 1, "herren", null),
      m("4", "Männer IV", 4, "herren", "Mä/männl."),
      m("3", "Männer III", 3, "herren", "Männer"),
    ]);
    expect(g[0].mannschaften.map((x) => x.name)).toEqual(["Männer I", "Männer II", "Männer III", "Männer IV"]);
  });
  it("Jugend: erst Altersklasse, dann Nummer", async () => {
    const { gruppiereMannschaften } = await import("./liga-oeffentlich");
    const g = gruppiereMannschaften([m("1", "mC2", 2, "jugend_maennlich", "C"), m("2", "mA", 1, "jugend_maennlich", "A"), m("3", "mC1", 1, "jugend_maennlich", "C")]);
    expect(g[0].mannschaften.map((x) => x.name)).toEqual(["mA", "mC1", "mC2"]);
  });
});
