import { describe, expect, it } from "vitest";
import { extrahiereDomain } from "./mail-diagnose";

describe("extrahiereDomain", () => {
  it("liest die Domain aus Absender mit Anzeigenamen", () => {
    expect(extrahiereDomain("HandballerPate <noreply@handballerpate.de>")).toBe("handballerpate.de");
    expect(extrahiereDomain("info@Mail.Example.org")).toBe("mail.example.org");
  });
  it("liefert null ohne gültige Adresse", () => {
    expect(extrahiereDomain(null)).toBeNull();
    expect(extrahiereDomain("kein absender")).toBeNull();
  });
});
