import { describe, expect, it } from "vitest";
import { istDesignNeu } from "./design-regel";

describe("istDesignNeu", () => {
  const alt = new Date("2026-09-01T10:00:00Z");
  const neu = new Date("2026-10-20T10:00:00Z");
  it("eigene Wahl geht vor", () => {
    expect(istDesignNeu(false, true, neu)).toBe(false);
    expect(istDesignNeu(true, false, alt)).toBe(true);
  });
  it("ohne Wahl: Demo und neue Vereine neu, Bestand klassisch", () => {
    expect(istDesignNeu(null, true, alt)).toBe(true);
    expect(istDesignNeu(null, false, neu)).toBe(true);
    expect(istDesignNeu(null, false, alt)).toBe(false);
  });
});
