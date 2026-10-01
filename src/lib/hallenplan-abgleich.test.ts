import { describe, expect, it } from "vitest";
import { gleicheAb, normalisiereName, spielnummerAusUid } from "./hallenplan-abgleich";

const termin = (over = {}) => ({
  id: "t1",
  start: new Date("2026-10-17T12:00:00Z"), // 14:00 Berlin
  icsUid: "rundenspiel:12345:HSG Test II:TV Gast:4711",
  heim: "HSG Test II",
  gast: "TV Gast",
  ...over,
});
const spiel = (over = {}) => ({
  id: "s1",
  spielnummer: 4711,
  datum: "2026-10-17",
  heimName: "HSG Test 2",
  gastName: "TV Gast",
  ...over,
});

describe("hallenplan-abgleich", () => {
  it("normalisiert römische und arabische Mannschaftsnummern gleich", () => {
    expect(normalisiereName("HSG Test II")).toBe(normalisiereName("HSG Test 2"));
    expect(normalisiereName("HSG Test")).not.toBe(normalisiereName("HSG Test 2"));
  });

  it("liest die Spielnummer nur aus der Nummern-Variante der UID", () => {
    expect(spielnummerAusUid("rundenspiel:1:A:B:4711")).toBe(4711);
    expect(spielnummerAusUid("rundenspiel:1:2026-10-17:14:00:A:B")).toBeNull();
    expect(spielnummerAusUid("rundenspiel:1:A:B:0")).toBeNull();
    expect(spielnummerAusUid("ics:abc")).toBeNull();
    expect(spielnummerAusUid(null)).toBeNull();
  });

  it("ordnet bei gleicher Nummer, Mannschaften und Tag sicher zu", () => {
    expect(gleicheAb([termin()], [spiel()])).toEqual([
      { terminId: "t1", status: "sicher", spielIds: ["s1"] },
    ]);
  });

  it("erkennt ein verlegtes Spiel (anderer Tag, gleiche Nummer) als sicher", () => {
    const r = gleicheAb([termin()], [spiel({ datum: "2026-11-01" })]);
    expect(r[0].status).toBe("sicher");
  });

  it("ohne Spielnummer: gleicher Tag + Mannschaften reicht, anderer Tag ist unklar", () => {
    const t = termin({ icsUid: "rundenspiel:1:2026-10-17:14:00:HSG Test II:TV Gast" });
    expect(gleicheAb([t], [spiel({ spielnummer: null })])[0].status).toBe("sicher");
    expect(gleicheAb([t], [spiel({ spielnummer: null, datum: "2026-11-01" })])[0].status).toBe("unklar");
  });

  it("meldet mehrdeutig statt zu raten", () => {
    const r = gleicheAb([termin()], [spiel(), spiel({ id: "s2" })]);
    expect(r[0]).toMatchObject({ status: "mehrdeutig", spielIds: ["s1", "s2"] });
  });

  it("gleiche Nummer, aber andere Mannschaften: unklar bzw. kein Treffer", () => {
    const r = gleicheAb([termin()], [spiel({ heimName: "Ganz Anders" })]);
    expect(r[0].status).toBe("unklar");
    expect(gleicheAb([termin()], [spiel({ heimName: "X", gastName: "Y", spielnummer: 1, datum: "2026-01-01" })])[0].status).toBe("kein_treffer");
  });
});
