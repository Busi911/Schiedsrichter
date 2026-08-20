import { describe, expect, it } from "vitest";
import { duplikatBenachrichtigungInhalt } from "./duplikat-benachrichtigung";

describe("duplikatBenachrichtigungInhalt", () => {
  it("verwendet Singular bei genau einem Fund", () => {
    const inhalt = duplikatBenachrichtigungInhalt("Musterverein", ["Zeile 1"]);
    expect(inhalt.ueberschrift).toContain("1 mögliches Duplikat ");
    expect(inhalt.ueberschrift).not.toContain("Duplikate");
    expect(inhalt.zeilen).toEqual(["Zeile 1"]);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/admin/termine");
  });

  it("verwendet Plural bei mehreren Funden", () => {
    const inhalt = duplikatBenachrichtigungInhalt("Musterverein", ["Zeile 1", "Zeile 2"]);
    expect(inhalt.ueberschrift).toContain("2 mögliche Duplikate");
  });
});
