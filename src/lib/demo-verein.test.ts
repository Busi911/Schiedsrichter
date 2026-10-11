import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/admin", () => ({ adminDb: {} }));

import { berlinZeit } from "./demo-verein";

describe("berlinZeit", () => {
  it("rechnet deutsche Wanduhrzeit unabhängig von der Serverzeitzone in UTC um (Sommerzeit)", () => {
    // 11.10.2026 10:00 Uhr in Berlin (CEST, UTC+2) + 2 Tage, 15:00 Uhr → 13.10.2026 13:00 UTC
    expect(berlinZeit(new Date("2026-10-11T08:00:00Z"), 2, 15).toISOString()).toBe("2026-10-13T13:00:00.000Z");
  });

  it("berücksichtigt den Wechsel auf die Winterzeit (25.10.2026)", () => {
    // 20.10.2026 (CEST) + 10 Tage = 30.10.2026 (CET, UTC+1), 15:00 Uhr → 14:00 UTC
    expect(berlinZeit(new Date("2026-10-20T12:00:00Z"), 10, 15).toISOString()).toBe("2026-10-30T14:00:00.000Z");
  });

  it("nimmt den Kalendertag in Berlin, nicht in UTC (kurz nach Mitternacht Berlin)", () => {
    // 11.10.2026 22:30 UTC ist in Berlin schon der 12.10. (00:30) → +0 Tage, 15:00 → 12.10. 13:00 UTC
    expect(berlinZeit(new Date("2026-10-11T22:30:00Z"), 0, 15).toISOString()).toBe("2026-10-12T13:00:00.000Z");
  });

  it("unterstützt negative Tage und Minuten", () => {
    expect(berlinZeit(new Date("2026-10-11T08:00:00Z"), -3, 15, 30).toISOString()).toBe("2026-10-08T13:30:00.000Z");
  });
});
