import { describe, expect, it } from "vitest";
import { begrenzeOutreachProLauf, maxVersucheFuerZiel } from "./outreach-einstellungen";

describe("begrenzeOutreachProLauf", () => {
  it("übernimmt gültige Zahlen und begrenzt auf 1–20", () => {
    expect(begrenzeOutreachProLauf("8")).toBe(8);
    expect(begrenzeOutreachProLauf(0)).toBe(1);
    expect(begrenzeOutreachProLauf("500")).toBe(20);
    expect(begrenzeOutreachProLauf("3.6")).toBe(4);
  });
  it("fällt bei Ungültigem auf den Standard 5", () => {
    expect(begrenzeOutreachProLauf("")).toBe(5);
    expect(begrenzeOutreachProLauf("abc")).toBe(5);
    expect(begrenzeOutreachProLauf(null)).toBe(5);
  });
});

describe("maxVersucheFuerZiel", () => {
  it("mindestens 25, sonst ein Vielfaches des Ziels", () => {
    expect(maxVersucheFuerZiel(5)).toBe(25);
    expect(maxVersucheFuerZiel(20)).toBe(100);
  });
});
