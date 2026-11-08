import { describe, expect, it } from "vitest";
import {
  FEHLER_ENDE_VOR_BEGINN,
  pruefeEndeMinutenNachBeginn,
  pruefeEndeNachBeginn,
} from "./zeit-pruefung";

describe("pruefeEndeNachBeginn", () => {
  const beginn = new Date("2026-11-22T10:00:00Z");
  it("erlaubt kein Ende", () => {
    expect(pruefeEndeNachBeginn(beginn, null)).toBeNull();
  });
  it("erlaubt ein späteres Ende", () => {
    expect(pruefeEndeNachBeginn(beginn, new Date("2026-11-22T11:00:00Z"))).toBeNull();
  });
  it("weist ein früheres Ende zurück", () => {
    expect(pruefeEndeNachBeginn(beginn, new Date("2026-11-22T09:00:00Z"))).toBe(FEHLER_ENDE_VOR_BEGINN);
  });
  it("weist ein gleiches Ende zurück", () => {
    expect(pruefeEndeNachBeginn(beginn, new Date(beginn))).toBe(FEHLER_ENDE_VOR_BEGINN);
  });
});

describe("pruefeEndeMinutenNachBeginn", () => {
  it("09:45–10:00 ist gültig, 09:45–09:00 nicht", () => {
    expect(pruefeEndeMinutenNachBeginn(585, 600)).toBeNull();
    expect(pruefeEndeMinutenNachBeginn(585, 540)).toBe(FEHLER_ENDE_VOR_BEGINN);
    expect(pruefeEndeMinutenNachBeginn(585, 585)).toBe(FEHLER_ENDE_VOR_BEGINN);
  });
});
