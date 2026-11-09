import { describe, expect, it } from "vitest";
import { findeUeberschneidungen, terminEnde, ueberschneiden } from "./einsatz-konflikt";

const d = (s: string) => new Date(`2026-11-15T${s}:00Z`);

describe("ueberschneiden", () => {
  it("gleicher Beginn überschneidet (Befund vom 15.11., 13:00)", () => {
    expect(ueberschneiden({ start: d("13:00"), ende: null }, { start: d("13:00"), ende: null })).toBe(true);
  });
  it("ohne Ende gilt eine Standarddauer von 90 Minuten", () => {
    expect(terminEnde({ start: d("13:00"), ende: null }).toISOString()).toBe("2026-11-15T14:30:00.000Z");
    expect(ueberschneiden({ start: d("13:00"), ende: null }, { start: d("14:00"), ende: null })).toBe(true);
    expect(ueberschneiden({ start: d("13:00"), ende: null }, { start: d("14:30"), ende: null })).toBe(false);
  });
  it("direktes Anschließen ist kein Konflikt", () => {
    expect(ueberschneiden({ start: d("10:00"), ende: d("11:00") }, { start: d("11:00"), ende: d("12:00") })).toBe(false);
  });
  it("echtes Ende wird beachtet", () => {
    expect(ueberschneiden({ start: d("10:00"), ende: d("10:30") }, { start: d("11:00"), ende: null })).toBe(false);
    expect(ueberschneiden({ start: d("10:00"), ende: d("12:00") }, { start: d("11:00"), ende: null })).toBe(true);
  });
  it("Turnierspiele ohne Ende überschneiden nur bei gleichem Beginn", () => {
    expect(ueberschneiden({ start: d("10:00"), ende: null, typ: "turnier_spiel" }, { start: d("10:30"), ende: null, typ: "turnier_spiel" })).toBe(false);
    expect(ueberschneiden({ start: d("10:00"), ende: null, typ: "turnier_spiel" }, { start: d("10:00"), ende: null, typ: "turnier_spiel" })).toBe(true);
  });
  it("findeUeberschneidungen filtert", () => {
    const l = [{ start: d("09:00"), ende: null, id: 1 }, { start: d("13:30"), ende: null, id: 2 }];
    expect(findeUeberschneidungen({ start: d("13:00"), ende: null }, l).map((x) => x.id)).toEqual([2]);
  });
});
