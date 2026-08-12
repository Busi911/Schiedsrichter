import { describe, expect, it } from "vitest";
import {
  generiereEinmalPasswort,
  hashePasswort,
  pruefePasswort,
} from "./passwort";

describe("hashePasswort/pruefePasswort", () => {
  it("verifiziert das korrekte Passwort gegen den erzeugten Hash", async () => {
    const hash = await hashePasswort("geheimes-passwort-123");
    await expect(pruefePasswort("geheimes-passwort-123", hash)).resolves.toBe(
      true
    );
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await hashePasswort("geheimes-passwort-123");
    await expect(pruefePasswort("anderes-passwort", hash)).resolves.toBe(
      false
    );
  });

  it("erzeugt für dasselbe Passwort unterschiedliche Hashes (zufälliger Salt)", async () => {
    const hashA = await hashePasswort("dasselbe-passwort");
    const hashB = await hashePasswort("dasselbe-passwort");
    expect(hashA).not.toBe(hashB);
  });

  it("lehnt einen unerwartet formatierten Hash ohne Fehler ab", async () => {
    await expect(pruefePasswort("irgendwas", "kein-gueltiges-format")).resolves.toBe(
      false
    );
  });
});

describe("generiereEinmalPasswort", () => {
  it("erzeugt ein Passwort mit der Standardlänge 12", () => {
    expect(generiereEinmalPasswort()).toHaveLength(12);
  });

  it("verwendet keine verwechselbaren Zeichen (0/O, 1/l/I)", () => {
    const passwort = generiereEinmalPasswort(200);
    expect(passwort).not.toMatch(/[0O1lI]/);
  });

  it("erzeugt bei wiederholtem Aufruf unterschiedliche Passwörter", () => {
    const a = generiereEinmalPasswort();
    const b = generiereEinmalPasswort();
    expect(a).not.toBe(b);
  });
});
