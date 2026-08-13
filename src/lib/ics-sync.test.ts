import { describe, expect, it } from "vitest";
import { normalisiereFeedUrl, textValue } from "./ics-sync";

describe("normalisiereFeedUrl", () => {
  it("wandelt webcal:// in https:// um", () => {
    expect(normalisiereFeedUrl("webcal://example.de/feed.ics")).toBe(
      "https://example.de/feed.ics"
    );
  });

  it("wandelt webcals:// in https:// um", () => {
    expect(normalisiereFeedUrl("webcals://example.de/feed.ics")).toBe(
      "https://example.de/feed.ics"
    );
  });

  it("lässt eine bereits normale https://-URL unverändert", () => {
    expect(normalisiereFeedUrl("https://example.de/feed.ics")).toBe(
      "https://example.de/feed.ics"
    );
  });
});

describe("textValue", () => {
  it("gibt null für null/undefined zurück", () => {
    expect(textValue(null)).toBeNull();
    expect(textValue(undefined)).toBeNull();
  });

  it("gibt einen String unverändert zurück", () => {
    expect(textValue("Halle 1")).toBe("Halle 1");
  });

  it("extrahiert .val aus einem node-ical-Objektwert (z.B. mit Zeitzonen-Parametern)", () => {
    expect(textValue({ val: "Halle 1", params: { TZID: "Europe/Berlin" } })).toBe(
      "Halle 1"
    );
  });

  it("wandelt sonstige Werte über String() um", () => {
    expect(textValue(42)).toBe("42");
  });
});
