import { describe, expect, it } from "vitest";
import { artNameVergeben, fehlendeStandardArten, pruefeArtName, STANDARD_ARTEN } from "./mitgliedsarten";

describe("pruefeArtName", () => {
  it("trimmt und fasst Leerzeichen zusammen", () => expect(pruefeArtName("  Förder   mitglied ")).toEqual({ name: "Förder mitglied" }));
  it("lehnt leer und zu lang ab", () => {
    expect(pruefeArtName("   ")).toHaveProperty("fehler");
    expect(pruefeArtName("x".repeat(61))).toHaveProperty("fehler");
  });
});

describe("artNameVergeben", () => {
  const arten = [{ id: "1", name: "Fördermitglied" }, { id: "2", name: "Ehrenmitglied" }];
  it("ignoriert Groß-/Kleinschreibung", () => expect(artNameVergeben("fördermitglied", arten)).toBe(true));
  it("die eigene Art zählt beim Umbenennen nicht", () => {
    expect(artNameVergeben("Fördermitglied", arten, "1")).toBe(false);
    expect(artNameVergeben("Fördermitglied", arten, "2")).toBe(true);
  });
  it("neuer Name ist frei", () => expect(artNameVergeben("Gönner", arten)).toBe(false));
});

describe("fehlendeStandardArten", () => {
  it("alle fehlen bei leerer Liste", () => expect(fehlendeStandardArten([])).toEqual([...STANDARD_ARTEN]));
  it("vorhandene (auch anders geschrieben) fehlen nicht", () => {
    expect(fehlendeStandardArten([{ name: "FÖRDERMITGLIED" }])).not.toContain("Fördermitglied");
    expect(fehlendeStandardArten([{ name: "FÖRDERMITGLIED" }])).toHaveLength(STANDARD_ARTEN.length - 1);
  });
});
