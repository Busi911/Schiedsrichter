import { describe, expect, it } from "vitest";
import { rollenHinweise } from "./rollen-hinweise";

const B = "https://app.example";

describe("rollenHinweise", () => {
  it("ohne Wart- oder Trainerrolle: nichts", () => {
    expect(rollenHinweise(["zeitnehmer", "ordner", "schiedsrichter"], B)).toEqual({ zeilen: [], cta: null });
  });

  it("Wart: eigene Seite mit Link, CTA führt nach dem Login dorthin", () => {
    const r = rollenHinweise(["zeitnehmerwart"], B);
    expect(r.zeilen[0]).toContain(`${B}/profil/zeitnehmerwart`);
    expect(r.zeilen[0]).toContain("So legst du los");
    expect(r.cta?.url).toBe(`${B}/login?redirect=${encodeURIComponent("/profil/zeitnehmerwart")}`);
    expect(r.zeilen.at(-1)).toContain("/hilfe#rollen");
  });

  it("mehrere Rollen: je Wart eine Zeile, doppelte nur einmal, CTA zur ersten Wart-Seite", () => {
    const r = rollenHinweise(["ordnerwart", "dienstwart", "ordnerwart", "trainer"], B);
    expect(r.zeilen.filter((z) => z.includes("/profil/")).length).toBe(2);
    expect(r.zeilen.some((z) => z.startsWith("Als Trainer"))).toBe(true);
    expect(r.cta?.url).toContain(encodeURIComponent("/profil/ordnerwart"));
  });

  it("nur Trainer: Hinweis, aber kein CTA", () => {
    const r = rollenHinweise(["trainer"], B);
    expect(r.zeilen[0]).toMatch(/^Als Trainer/);
    expect(r.cta).toBeNull();
  });
});
