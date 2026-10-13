import { describe, expect, it } from "vitest";
import { BETA_PLAETZE_MAX, betaPlaetzeSatz, betaStand, naechstesBetaLimit } from "./beta-plaetze";

describe("naechstesBetaLimit", () => {
  it("bleibt, solange ein Platz frei ist", () => {
    expect(naechstesBetaLimit(5, 3)).toBe(5);
    expect(naechstesBetaLimit(5, 4)).toBe(5);
  });
  it("erhöht um einen Platz, wenn das Kontingent voll ist", () => {
    expect(naechstesBetaLimit(5, 5)).toBe(6);
    expect(naechstesBetaLimit(3, 7)).toBe(8); // von Hand belegt über dem Limit: ein Platz mehr als belegt
  });
  it("nie über das Maximum, ein höheres Limit wird nicht gesenkt", () => {
    expect(naechstesBetaLimit(9, 9)).toBe(BETA_PLAETZE_MAX);
    expect(naechstesBetaLimit(10, 10)).toBe(10);
    expect(naechstesBetaLimit(9, 12)).toBe(10);
    expect(naechstesBetaLimit(15, 15)).toBe(15);
  });
});

describe("betaStand / betaPlaetzeSatz", () => {
  it("zählt freie Plätze und erkennt ein volles Kontingent", () => {
    expect(betaStand(6, 5)).toEqual({ limit: 6, belegt: 5, frei: 1, voll: false });
    expect(betaStand(10, 11)).toEqual({ limit: 10, belegt: 11, frei: 0, voll: true });
  });
  it("formuliert den Hinweis", () => {
    expect(betaPlaetzeSatz(1)).toBe("Es ist nur noch ein Beta-Platz frei.");
    expect(betaPlaetzeSatz(2)).toBe("Es sind nur noch 2 Beta-Plätze frei.");
    expect(betaPlaetzeSatz(0)).toBeNull();
  });
});
