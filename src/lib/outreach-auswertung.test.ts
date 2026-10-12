import { describe, expect, it } from "vitest";
import { tagDeutsch, werteOutreachAus } from "./outreach-auswertung";

const leer = { angeschriebenAm: null, anspracheGesendetAm: null, followupGesendetAm: null, outreachAbgemeldetAm: null };

describe("Outreach-Auswertung", () => {
  it("zählt je Tag und Art, neueste Tage zuerst, Vereine nur einmal", () => {
    const a = werteOutreachAus([
      { ...leer, anspracheGesendetAm: new Date("2026-10-05T08:00:00Z"), followupGesendetAm: new Date("2026-10-12T08:00:00Z") },
      { ...leer, angeschriebenAm: new Date("2026-10-05T10:00:00Z") },
      { ...leer, outreachAbgemeldetAm: new Date("2026-10-06T10:00:00Z") },
      leer,
    ]);
    expect(a.vereineAngeschrieben).toBe(2);
    expect(a.gesamt).toEqual({ instagram: 1, email: 1, followup: 1, abgemeldet: 1 });
    expect(a.tage.map((t) => t.tag)).toEqual(["2026-10-12", "2026-10-06", "2026-10-05"]);
    expect(a.tage[2].zahlen).toMatchObject({ instagram: 1, email: 1 });
    expect(a.tage[1].summe).toBe(0);
  });
  it("rechnet in deutscher Zeit (kurz nach Mitternacht)", () => {
    expect(tagDeutsch(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
  });
});
