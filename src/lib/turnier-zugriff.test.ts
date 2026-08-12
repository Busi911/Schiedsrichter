import { describe, expect, it } from "vitest";
import { istTurnierBerechtigt } from "./turnier-zugriff";

describe("istTurnierBerechtigt", () => {
  it("lässt Admins immer zu, unabhängig vom Turnierverantwortlichen", () => {
    const session = { user: { id: "admin-1", istAdmin: true } };
    expect(
      istTurnierBerechtigt({ turnierVerantwortlicherId: null }, session)
    ).toBe(true);
    expect(
      istTurnierBerechtigt({ turnierVerantwortlicherId: "trainer-1" }, session)
    ).toBe(true);
  });

  it("lässt den benannten Turnierverantwortlichen zu", () => {
    const session = { user: { id: "trainer-1", istAdmin: false } };
    expect(
      istTurnierBerechtigt({ turnierVerantwortlicherId: "trainer-1" }, session)
    ).toBe(true);
  });

  it("blockiert andere Trainer und nicht zugeordnete Turniere", () => {
    const session = { user: { id: "trainer-2", istAdmin: false } };
    expect(
      istTurnierBerechtigt({ turnierVerantwortlicherId: "trainer-1" }, session)
    ).toBe(false);
    expect(
      istTurnierBerechtigt({ turnierVerantwortlicherId: null }, session)
    ).toBe(false);
  });
});
