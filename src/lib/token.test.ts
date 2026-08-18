import { describe, expect, it } from "vitest";
import { generiereOeffentlichenToken } from "@/lib/token";

describe("generiereOeffentlichenToken", () => {
  it("stellt dem Token einen lesbaren, transliterierten Vereinsnamen-Slug voran", () => {
    const token = generiereOeffentlichenToken("TSF Heuchelheim");
    expect(token.startsWith("tsf-heuchelheim-")).toBe(true);
  });

  it("transliteriert deutsche Umlaute statt sie nur zu entfernen", () => {
    const token = generiereOeffentlichenToken("SV Grünwald 08");
    expect(token.startsWith("sv-gruenwald-08-")).toBe(true);
  });

  it("entfernt Sonderzeichen und normalisiert auf Kleinbuchstaben", () => {
    const token = generiereOeffentlichenToken("TV 1893 e.V.");
    expect(token.startsWith("tv-1893-e-v-")).toBe(true);
  });

  it("kappt sehr lange Vereinsnamen, statt sie endlos in die URL zu ziehen", () => {
    const token = generiereOeffentlichenToken(
      "Sehr Langer Vereinsname Mit Vielen Wörtern Und Zusätzen e.V."
    );
    const [slug] = token.split(/-(?=[0-9a-f]{16}$)/);
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it("fällt bei leerem/nur aus Sonderzeichen bestehendem Namen auf reines Zufalls-Token zurück", () => {
    const token = generiereOeffentlichenToken("!!!");
    expect(token).not.toContain("-");
    expect(token.length).toBe(16);
  });

  it("hängt einen 16-stelligen Zufallsteil an, der bei jedem Aufruf variiert", () => {
    const a = generiereOeffentlichenToken("TSF Heuchelheim");
    const b = generiereOeffentlichenToken("TSF Heuchelheim");
    expect(a).not.toBe(b);
    const zufallA = a.slice(a.length - 16);
    expect(zufallA).toMatch(/^[0-9a-f]{16}$/);
  });
});
