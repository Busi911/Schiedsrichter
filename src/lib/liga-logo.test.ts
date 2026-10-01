import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { baueLogoIcon, LogoFehler, verarbeiteLogo } from "./liga-logo";

const testbild = (breite: number, hoehe: number, format: "png" | "jpeg" | "webp" = "png") =>
  sharp({ create: { width: breite, height: hoehe, channels: 3, background: "#c00000" } })
    .toFormat(format)
    .toBuffer();

describe("Vereinslogo", () => {
  it("normalisiert PNG/JPEG/WebP auf ein quadratisches 512er-PNG", async () => {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const ausgabe = await verarbeiteLogo(await testbild(1000, 400, format));
      const meta = await sharp(ausgabe).metadata();
      expect(meta).toMatchObject({ format: "png", width: 512, height: 512 });
    }
  });

  it("lehnt SVG, Text und defekte Dateien ab", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(verarbeiteLogo(svg)).rejects.toBeInstanceOf(LogoFehler);
    await expect(verarbeiteLogo(Buffer.from("kein bild"))).rejects.toBeInstanceOf(LogoFehler);
    await expect(verarbeiteLogo(Buffer.alloc(0))).rejects.toBeInstanceOf(LogoFehler);
  });

  it("lehnt zu große Dateien ab", async () => {
    await expect(verarbeiteLogo(Buffer.alloc(6 * 1024 * 1024))).rejects.toBeInstanceOf(LogoFehler);
  });

  it("baut Icons in der gewünschten Größe mit Rand auf weißem Grund", async () => {
    const logo = await verarbeiteLogo(await testbild(300, 300));
    for (const px of [180, 192, 512]) {
      const icon = await baueLogoIcon(logo, px);
      const meta = await sharp(icon).metadata();
      expect(meta).toMatchObject({ format: "png", width: px, height: px });
    }
    // Ecke bleibt weiß (Sicherheitsrand), Mitte ist das Logo (rot)
    const raw = await sharp(await baueLogoIcon(logo, 192)).removeAlpha().raw().toBuffer();
    expect([raw[0], raw[1], raw[2]]).toEqual([255, 255, 255]);
    const mitte = (96 * 192 + 96) * 3;
    expect(raw[mitte]).toBeGreaterThan(150);
    expect(raw[mitte + 1]).toBeLessThan(60);
  });
});
