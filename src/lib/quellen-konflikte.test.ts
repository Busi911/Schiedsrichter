import { describe, expect, it } from "vitest";
import { findeQuellenKonflikte, type QuellenZeile } from "./quellen-konflikte-rechnung";

const basis: QuellenZeile = {
  ligaVereinId: "v1",
  vereinName: "HSG Test",
  mannschaftId: "m1",
  schluessel: "herren::1",
  mannschaftName: "HSG Test",
  kategorie: "herren",
  geschlecht: "m",
  altersklasse: null,
  nummer: 1,
  saison: "2026/27",
  quelle: "nuliga",
  ligaName: "Oberliga",
};

describe("findeQuellenKonflikte", () => {
  it("meldet nichts, wenn dieselbe Mannschaft in beiden Quellen läuft", () => {
    const z = [basis, { ...basis, quelle: "handball_net", ligaName: "3. Liga" }];
    expect(findeQuellenKonflikte(z)).toEqual([]);
  });

  it("meldet vom Sync getrennte Mannschaften (Schlüssel :dhb)", () => {
    const z = [basis, { ...basis, mannschaftId: "m2", schluessel: "herren::1:dhb", mannschaftName: "HSG Test (DHB)", quelle: "handball_net", ligaName: "3. Liga" }];
    const k = findeQuellenKonflikte(z);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ vereinName: "HSG Test", vomSyncGetrennt: true });
    expect(k[0].handballNet.ligaName).toBe("3. Liga");
  });

  it("meldet auch zwei gleichartige Mannschaften ohne :dhb-Schlüssel als mögliche Dublette", () => {
    const z = [basis, { ...basis, mannschaftId: "m3", schluessel: "herren::1x", quelle: "handball_net" }];
    expect(findeQuellenKonflikte(z)).toMatchObject([{ vomSyncGetrennt: false }]);
  });

  it("meldet nichts bei verschiedener Art, Saison oder Verein", () => {
    const hnet = { ...basis, mannschaftId: "m2", quelle: "handball_net" };
    expect(findeQuellenKonflikte([basis, { ...hnet, nummer: 2 }])).toEqual([]);
    expect(findeQuellenKonflikte([basis, { ...hnet, saison: "2025/26" }])).toEqual([]);
    expect(findeQuellenKonflikte([basis, { ...hnet, ligaVereinId: "v2" }])).toEqual([]);
    expect(findeQuellenKonflikte([basis, { ...hnet, kategorie: "jugend" }])).toEqual([]);
  });

  it("ignoriert andere Quellen (z.B. ndr)", () => {
    expect(findeQuellenKonflikte([basis, { ...basis, mannschaftId: "m2", quelle: "ndr" }])).toEqual([]);
  });
});
