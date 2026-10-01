import { describe, expect, it } from "vitest";
import { gleicheAb, normalisiereName, parseKategorie, spielnummerAusUid } from "./hallenplan-abgleich";

const termin = (over = {}) => ({
  id: "t1",
  start: new Date("2026-10-17T12:00:00Z"), // 14:00 Berlin
  icsUid: "rundenspiel:12345:HSG Test II:TV Gast:4711",
  heim: "HSG Test II",
  gast: "TV Gast",
  kategorie: null as string | null,
  ...over,
});
const spiel = (over = {}) => ({
  id: "s1",
  spielnummer: 4711,
  datum: "2026-10-17",
  uhrzeit: "14:00",
  geschlecht: null as string | null,
  altersklasse: null as string | null,
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

  it("vergleicht Spielgemeinschaften unabhängig von der Partner-Reihenfolge und '1' = erste Mannschaft", () => {
    expect(normalisiereName("mJSG Bieber/Heuchelheim")).toBe(normalisiereName("mJSG Heuchelheim/Bieber"));
    expect(normalisiereName("wJSG Bieber/Heuchelheim II")).toBe(normalisiereName("wJSG Heuchelheim/Bieber 2"));
    expect(normalisiereName("mJSG Bieber/Heuchelheim")).not.toBe(normalisiereName("wJSG Bieber/Heuchelheim"));
    expect(normalisiereName("TSF Heuchelheim 1")).toBe(normalisiereName("TSF Heuchelheim"));
    expect(normalisiereName("TSF Heuchelheim II")).not.toBe(normalisiereName("TSF Heuchelheim"));
  });

  it("entscheidet mehrere Spiele am selben Tag über die Uhrzeit", () => {
    const r = gleicheAb(
      [termin()],
      [spiel({ id: "s1", uhrzeit: "10:00" }), spiel({ id: "s2", uhrzeit: "14:00" })]
    );
    expect(r[0]).toEqual({ terminId: "t1", status: "sicher", spielIds: ["s2"] });
  });

  it("gleiche Spielnummer am selben Tag, aber andere Mannschaften, ist KEIN Kandidat", () => {
    const r = gleicheAb([termin()], [spiel({ heimName: "Ganz", gastName: "Anders" })]);
    expect(r[0].status).toBe("kein_treffer");
  });

  it("ein Rückspiel Monate später oder aus der Vorsaison ist kein Kandidat", () => {
    const t = termin({ start: new Date("2026-05-16T10:50:00Z"), icsUid: "rundenspiel:1:2026-05-16:12:50:HSG Test II:TV Gast" });
    expect(gleicheAb([t], [spiel({ spielnummer: 128, datum: "2027-04-25" })])[0].status).toBe("kein_treffer");
    expect(gleicheAb([t], [spiel({ spielnummer: 128, datum: "2026-06-01" })])[0].status).toBe("unklar");
  });

  it("liest Geschlecht und Altersklasse aus dem Hallenplan-Kategorietext", () => {
    expect(parseKategorie("mJC")).toEqual({ geschlecht: "m", altersklasse: "C" });
    expect(parseKategorie("wJD")).toEqual({ geschlecht: "w", altersklasse: "D" });
    expect(parseKategorie("Mä/männl.")).toEqual({ geschlecht: "m", altersklasse: null });
    expect(parseKategorie("Fr/weibl.")).toEqual({ geschlecht: "w", altersklasse: null });
    expect(parseKategorie("irgendwas")).toBeNull();
    expect(parseKategorie(null)).toBeNull();
  });

  it("trennt gleichnamige Spiele verschiedener Altersklassen am selben Tag (auch bei gleicher Uhrzeit)", () => {
    const t = termin({ kategorie: "mJD" });
    const r = gleicheAb(
      [t],
      [
        spiel({ id: "c", geschlecht: "m", altersklasse: "C" }),
        spiel({ id: "d", geschlecht: "m", altersklasse: "D" }),
      ]
    );
    expect(r[0]).toEqual({ terminId: "t1", status: "sicher", spielIds: ["d"] });
  });

  it("falsche Altersklasse oder falsches Geschlecht ist nie ein Treffer", () => {
    const t = termin({ kategorie: "wJC" });
    expect(gleicheAb([t], [spiel({ geschlecht: "m", altersklasse: "C" })])[0].status).toBe("kein_treffer");
    expect(gleicheAb([t], [spiel({ geschlecht: "w", altersklasse: "B" })])[0].status).toBe("kein_treffer");
    // unbekannte Liga-Altersklasse schränkt nicht ein
    expect(gleicheAb([t], [spiel()])[0].status).toBe("sicher");
  });

  it("ein Freundschaftsspiel bekommt kein Liga-Spiel der gleichen Paarung Wochen später als Kandidat", () => {
    const t = termin({ pflichtspiel: false, icsUid: "rundenspiel:1:2026-10-01:14:00:HSG Test II:TV Gast" });
    expect(gleicheAb([t], [spiel({ spielnummer: 14, datum: "2026-11-10" })])[0].status).toBe("kein_treffer");
    // am selben Tag bleibt es ein sicherer Treffer
    expect(gleicheAb([t], [spiel({ spielnummer: 14, datum: "2026-10-17" })])[0].status).toBe("sicher");
  });

  it("meldet mehrdeutig statt zu raten", () => {
    const r = gleicheAb([termin()], [spiel(), spiel({ id: "s2" })]); // beide 14:00
    expect(r[0]).toMatchObject({ status: "mehrdeutig", spielIds: ["s1", "s2"] });
  });

  it("gleiche Nummer, aber andere Mannschaften: unklar bzw. kein Treffer", () => {
    const r = gleicheAb([termin()], [spiel({ heimName: "Ganz Anders" })]);
    expect(r[0].status).toBe("kein_treffer");
    expect(gleicheAb([termin()], [spiel({ heimName: "X", gastName: "Y", spielnummer: 1, datum: "2026-01-01" })])[0].status).toBe("kein_treffer");
  });
});
