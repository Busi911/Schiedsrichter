import { describe, expect, it } from "vitest";
import { ausfallRuecknahmeErlaubt, belegbareMannschaften, darfBelegen, darfBelegungAufheben } from "./training-belegung";

const ALLE = ["herren", "damen", "jugend"];

describe("belegbareMannschaften", () => {
  it("Trainer: nur die eigenen, nie die ausfallende Mannschaft", () => {
    expect(belegbareMannschaften({ istAdmin: false, trainerMannschaftIds: ["damen", "jugend"] }, ALLE, "herren")).toEqual(["damen", "jugend"]);
    expect(belegbareMannschaften({ istAdmin: false, trainerMannschaftIds: ["herren", "damen"] }, ALLE, "herren")).toEqual(["damen"]);
  });
  it("Admin: jede andere Mannschaft", () => {
    expect(belegbareMannschaften({ istAdmin: true, trainerMannschaftIds: [] }, ALLE, "herren")).toEqual(["damen", "jugend"]);
  });
  it("Person ohne Trainerrolle: keine; unbekannte Mannschaften zählen nicht", () => {
    expect(belegbareMannschaften({ istAdmin: false, trainerMannschaftIds: [] }, ALLE, "herren")).toEqual([]);
    expect(belegbareMannschaften({ istAdmin: false, trainerMannschaftIds: ["fremd"] }, ALLE, "herren")).toEqual([]);
  });
});

describe("darfBelegen / Aufheben / Rücknahme", () => {
  it("darfBelegen prüft die Zielmannschaft", () => {
    const trainer = { istAdmin: false, trainerMannschaftIds: ["damen"] };
    expect(darfBelegen(trainer, ALLE, "herren", "damen")).toBe(true);
    expect(darfBelegen(trainer, ALLE, "herren", "jugend")).toBe(false);
    expect(darfBelegen(trainer, ALLE, "damen", "damen")).toBe(false);
  });
  it("Aufheben: Admin oder Trainer der buchenden Mannschaft", () => {
    expect(darfBelegungAufheben({ istAdmin: true, trainerMannschaftIds: [] }, "damen")).toBe(true);
    expect(darfBelegungAufheben({ istAdmin: false, trainerMannschaftIds: ["damen"] }, "damen")).toBe(true);
    expect(darfBelegungAufheben({ istAdmin: false, trainerMannschaftIds: ["herren"] }, "damen")).toBe(false);
  });
  it("Ausfall zurücknehmen: ohne Belegung jeder Berechtigte, mit Belegung nur ein Admin", () => {
    expect(ausfallRuecknahmeErlaubt(false, false)).toBe(true);
    expect(ausfallRuecknahmeErlaubt(true, false)).toBe(false);
    expect(ausfallRuecknahmeErlaubt(true, true)).toBe(true);
  });
});
