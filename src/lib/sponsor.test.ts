import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("@/db/retry", () => ({ mitColdStartRetry: (f: () => unknown) => f() }));

import { pruefeSponsorLink, SponsorFehler, sponsorWirksam, verarbeiteSponsorBild } from "./sponsor";

describe("sponsorWirksam", () => {
  const basis = { aktiv: true, hatBild: true, gueltigBis: null as string | null };
  it("wirkt nur mit aktiv, Bild und nicht abgelaufenem Zeitraum", () => {
    expect(sponsorWirksam(basis, "2026-10-02")).toBe(true);
    expect(sponsorWirksam({ ...basis, aktiv: false }, "2026-10-02")).toBe(false);
    expect(sponsorWirksam({ ...basis, hatBild: false }, "2026-10-02")).toBe(false);
    expect(sponsorWirksam({ ...basis, gueltigBis: "2026-10-02" }, "2026-10-02")).toBe(true);
    expect(sponsorWirksam({ ...basis, gueltigBis: "2026-10-01" }, "2026-10-02")).toBe(false);
  });
});

describe("pruefeSponsorLink", () => {
  it("lässt nur https-Links zu", () => {
    expect(pruefeSponsorLink("")).toBeNull();
    expect(pruefeSponsorLink(" https://www.beispiel.de/x ")).toBe("https://www.beispiel.de/x");
    expect(() => pruefeSponsorLink("http://beispiel.de")).toThrow(SponsorFehler);
    expect(() => pruefeSponsorLink("javascript:alert(1)")).toThrow(SponsorFehler);
    expect(() => pruefeSponsorLink("https://a b.de")).toThrow(SponsorFehler);
    expect(() => pruefeSponsorLink("kein link")).toThrow(SponsorFehler);
  });
});

describe("verarbeiteSponsorBild", () => {
  it("normalisiert ein Bild zu PNG (max. 1200 px, ohne Vergrößerung)", async () => {
    const jpeg = await sharp({ create: { width: 2400, height: 800, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const png = await verarbeiteSponsorBild(jpeg);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(400);
    const klein = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await sharp(await verarbeiteSponsorBild(klein)).metadata()).width).toBe(100);
  });

  it("lehnt SVG, Textdateien und zu große Dateien ab", async () => {
    await expect(verarbeiteSponsorBild(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toThrow(SponsorFehler);
    await expect(verarbeiteSponsorBild(Buffer.from("kein Bild"))).rejects.toThrow(SponsorFehler);
    await expect(verarbeiteSponsorBild(Buffer.alloc(0))).rejects.toThrow(SponsorFehler);
    await expect(verarbeiteSponsorBild(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(SponsorFehler);
  });
});
