import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./app-url", () => ({ appUrl: () => "https://app.example" }));

// EmailZeile ist ein String oder ein Objekt mit text (siehe email-layout.ts)
const text = (z: string | { text: string }) => (typeof z === "string" ? z : z.text);

describe("willkommensInhalt mit Rollen", () => {
  it("ohne Wart-/Trainerrolle unverändert: Login-Button, keine Zusatzzeilen", async () => {
    const { willkommensInhalt } = await import("./willkommens-mail");
    const i = willkommensInhalt("TSV", "a@b.de", null, ["zeitnehmer"]);
    expect(i.cta).toEqual({ text: "Jetzt einloggen", url: "https://app.example/login" });
    expect(i.zeilen).toHaveLength(1);
  });

  it("mit Wart-Rolle: Starthilfe-Zeile und Button direkt zur Wart-Seite, Einmal-Passwort bleibt", async () => {
    const { willkommensInhalt } = await import("./willkommens-mail");
    const i = willkommensInhalt("TSV", "a@b.de", "Pw-123", ["ordnerwart"]);
    expect(i.zeilen.some((z) => text(z).includes("Einmal-Passwort: Pw-123"))).toBe(true);
    expect(i.zeilen.some((z) => text(z).includes("/profil/ordnerwart") && text(z).includes("So legst du los"))).toBe(true);
    expect(i.cta?.url).toContain(encodeURIComponent("/profil/ordnerwart"));
  });

  it("Trainer: Hinweis, Login-Button bleibt", async () => {
    const { willkommensInhalt } = await import("./willkommens-mail");
    const i = willkommensInhalt("TSV", "a@b.de", null, ["trainer"]);
    expect(i.zeilen.some((z) => text(z).startsWith("Als Trainer"))).toBe(true);
    expect(i.cta?.url).toBe("https://app.example/login");
  });
});
