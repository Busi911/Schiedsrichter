import { describe, expect, it } from "vitest";
import { parseFavoriten } from "./liga-favoriten-parse";

const A = "11111111-1111-4111-8111-111111111111";

describe("parseFavoriten", () => {
  it("liest gültige IDs und verwirft Ungültiges/Kaputtes", () => {
    expect(parseFavoriten(JSON.stringify({ vereine: [A, "x"], mannschaften: [A, A] }))).toEqual({
      vereine: [A],
      mannschaften: [A],
    });
    expect(parseFavoriten("{kaputt")).toEqual({ vereine: [], mannschaften: [] });
    expect(parseFavoriten(null)).toEqual({ vereine: [], mannschaften: [] });
  });
});
