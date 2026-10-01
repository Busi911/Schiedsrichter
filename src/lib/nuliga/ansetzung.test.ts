import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnsetzungen } from "./parsers/ansetzung";
import { parseGroupPage } from "./parsers/group-page";

const fixture = readFileSync(path.join(import.meta.dirname, "__fixtures__", "group-page.html"), "utf8");

describe("parseAnsetzungen", () => {
  it("liest je Spielnummer nur das Schiedsrichter-Kürzel, nie den vollen Namen", () => {
    const r = parseAnsetzungen(fixture);
    expect(r).toEqual([
      { spielnummer: 10, kuerzel: "Must." },
      { spielnummer: 11, kuerzel: "Must." },
    ]);
    expect(JSON.stringify(r)).not.toContain("Mustermann");
  });

  it("die öffentlichen Parser-Ergebnisse (Whitelist) enthalten weiterhin keine Ansetzung", () => {
    const json = JSON.stringify(parseGroupPage(fixture));
    expect(json).not.toContain("Must.");
    expect(json).not.toContain("Mustermann");
  });
});
