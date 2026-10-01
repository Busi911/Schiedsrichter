import { describe, expect, it } from "vitest";
import { vereinsFarbton, vereinsInitialen, vereinsManifest } from "./liga-pwa";
import { parseFavoriten, schalteUm } from "./liga-favoriten-lokal";

describe("Vereins-Web-App", () => {
  it("Farbton ist stabil und im gültigen Bereich", () => {
    const h = vereinsFarbton("tsf-heuchelheim");
    expect(h).toBe(vereinsFarbton("tsf-heuchelheim"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(vereinsFarbton("hsg-hungen-lich")).not.toBe(h);
  });

  it("Initialen aus den ersten beiden Wörtern (ohne e.V.)", () => {
    expect(vereinsInitialen("TSF Heuchelheim")).toBe("TH");
    expect(vereinsInitialen("HSG Hungen/Lich")).toBe("HH");
    expect(vereinsInitialen("Handball e.V.")).toBe("HA");
    expect(vereinsInitialen("")).toBe("H");
  });

  it("Manifest trägt Namen, Startseite und Icons des Vereins", () => {
    const m = vereinsManifest({ slug: "tsf-heuchelheim", name: "TSF Heuchelheim" });
    expect(m.name).toBe("TSF Heuchelheim");
    expect(m.start_url).toBe("/verein/tsf-heuchelheim?app=1");
    expect(m.icons.map((i) => i.src)).toContain("/verein/tsf-heuchelheim/icon/512");
    expect(vereinsManifest({ slug: "x", name: "Sehr langer Vereinsname e.V." }).short_name.length).toBeLessThanOrEqual(14);
  });
});

describe("lokale Favoriten", () => {
  const id1 = "11111111-1111-4111-8111-111111111111";
  const id2 = "22222222-2222-4222-8222-222222222222";

  it("liest robust (kaputt, falsche Typen, fremde Werte)", () => {
    expect(parseFavoriten(null)).toEqual({ vereine: [], mannschaften: [] });
    expect(parseFavoriten("{kaputt")).toEqual({ vereine: [], mannschaften: [] });
    expect(
      parseFavoriten(JSON.stringify({ vereine: [id1, "<script>", 5], mannschaften: [id2, id2] }))
    ).toEqual({ vereine: [id1], mannschaften: [id2] });
  });

  it("schaltet Verein und Mannschaft unabhängig um", () => {
    let f = parseFavoriten(null);
    f = schalteUm(f, "verein", id1);
    f = schalteUm(f, "mannschaft", id2);
    expect(f).toEqual({ vereine: [id1], mannschaften: [id2] });
    f = schalteUm(f, "verein", id1);
    expect(f).toEqual({ vereine: [], mannschaften: [id2] });
  });
});
