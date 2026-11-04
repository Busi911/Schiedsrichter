import { describe, expect, it } from "vitest";
import { teilenAdresse, teilenPfadFuer } from "./teilen";

describe("teilenAdresse", () => {
  it("macht aus einem Pfad eine vollständige Adresse", () => {
    expect(teilenAdresse("/verein/hsg/herren-1", "https://handballerpate.de")).toBe("https://handballerpate.de/verein/hsg/herren-1");
  });
  it("lässt vollständige Adressen stehen", () => {
    expect(teilenAdresse("https://handballerpate.de/verein/hsg", "https://anders.test")).toBe("https://handballerpate.de/verein/hsg");
  });
  it("entfernt Abfrage und Anker (Tracking, ?sponsor=zeigen)", () => {
    expect(teilenAdresse("/verein/hsg?sponsor=zeigen&utm_source=x#spiel", "https://handballerpate.de")).toBe("https://handballerpate.de/verein/hsg");
  });
});

describe("teilenPfadFuer", () => {
  const mannschaften = [{ id: "a", slug: "herren-1" }, { id: "b", slug: "damen" }];
  it("nimmt die Seite der ersten passenden Mannschaft", () => {
    expect(teilenPfadFuer("hsg", mannschaften, ["b", "a"])).toBe("/verein/hsg/damen");
  });
  it("fällt auf die Vereinsseite zurück", () => {
    expect(teilenPfadFuer("hsg", mannschaften, ["x"])).toBe("/verein/hsg");
    expect(teilenPfadFuer("hsg", mannschaften, [])).toBe("/verein/hsg");
  });
});
