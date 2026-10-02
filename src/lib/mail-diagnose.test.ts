import { describe, expect, it } from "vitest";
import { extrahiereDomain, hauptDomain } from "./mail-diagnose";

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

describe("hauptDomain", () => {
  it("kürzt auf die Hauptdomain", () => {
    expect(hauptDomain("www.handballerpate.de")).toBe("handballerpate.de");
    expect(hauptDomain("schiedsrichter-x.vercel.app:443")).toBe("vercel.app");
    expect(hauptDomain(null)).toBeNull();
  });
});
