import { describe, expect, it } from "vitest";
import { dringendeTeamIds } from "./team-dringlichkeit";

const heute = "2026-10-18";
const spiel = (datum: string, status = "geplant", toreHeim: number | null = null) => ({
  heimTeamId: "H",
  gastTeamId: "G",
  datum,
  status,
  toreHeim,
});

describe("dringendeTeamIds", () => {
  it("Spiel heute und gestern gespielt ohne Ergebnis sind dringend", () => {
    expect([...dringendeTeamIds([spiel(heute)], heute)].sort()).toEqual(["G", "H"]);
    expect(dringendeTeamIds([spiel("2026-10-17", "gespielt")], heute).size).toBe(2);
  });
  it("Ergebnis vorhanden, Zukunft, abgesagt oder verlegt sind nicht dringend", () => {
    expect(dringendeTeamIds([spiel("2026-10-17", "gespielt", 29)], heute).size).toBe(0);
    expect(dringendeTeamIds([spiel("2026-10-19")], heute).size).toBe(0);
    expect(dringendeTeamIds([spiel("2026-10-17", "abgesagt")], heute).size).toBe(0);
    expect(dringendeTeamIds([spiel("2026-10-17", "verlegt")], heute).size).toBe(0);
  });
});
