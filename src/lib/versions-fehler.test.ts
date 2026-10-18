import { describe, expect, it } from "vitest";
import { istVersionsFehler } from "./versions-fehler";

describe("istVersionsFehler", () => {
  it("erkennt Deploy-Versionsfehler", () => {
    expect(istVersionsFehler(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true);
    const chunk = new Error("Loading chunk 123 failed.");
    chunk.name = "ChunkLoadError";
    expect(istVersionsFehler(chunk)).toBe(true);
    expect(istVersionsFehler(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/a.js"))).toBe(true);
  });
  it("lässt fachliche Fehler in Ruhe", () => {
    expect(istVersionsFehler(new Error("Es sind bereits 2 Zeitnehmer zugeordnet."))).toBe(false);
    expect(istVersionsFehler(null)).toBe(false);
  });
});
