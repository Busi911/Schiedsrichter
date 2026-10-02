import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnsetzungen } from "./parsers/ansetzung";
import { parseGroupPage } from "./parsers/group-page";

const fixture = readFileSync(path.join(import.meta.dirname, "__fixtures__", "group-page.html"), "utf8");

const tabelle = (zelle: string) =>
  `<table><tr><th>Nr.</th><th>Heimmannschaft</th><th>Gastmannschaft</th><th>&nbsp;</th></tr>` +
  `<tr><td>7</td><td>A</td><td>B</td><td>${zelle}</td></tr></table>`;

describe("parseAnsetzungen (Aufbau der Zelle)", () => {
  const faelle: [string, string, string | null][] = [
    ["ein Element, gekürzt", `<span title="Muster Max">Must.</span>`, "Must."],
    ["kurzer Nachname ohne Punkt", `<span title="Bock Anna">Bock</span>`, "Bock"],
    ["Gespann in einem Element", `<span title="Eike Ute / Fischer Jan">Eike/Fisc.</span>`, "Eike/Fisc."],
    ["Gespann in zwei Elementen", `<span title="Lippert A">Lipp.</span>/<span title="Lippert B">Lipp.</span>`, "Lipp./Lipp."],
    ["Gespann als Link mit Leerzeichen", `<a title="X Y">Kert.</a> / <a title="Z">Knod.</a>`, "Kert./Knod."],
    ["zusammengesetzter Name", `<span title="Al Mustafa / Fara">Al M./Fara.</span>`, "Al M./Fara."],
    ["Gespann, linker Name unabgekürzt ohne Punkt", `<span title="Muster Anton / Beispiel Darwin">Ekk/Walt.</span>`, "Ekk/Walt."],
    ["Gespann mit Umlaut", `<span title="Muster Tanja / Beispiel Tanja">Taff./Tröl.</span>`, "Taff./Tröl."],
    ["Wertungscode ist kein Kürzel", `<span title="Nicht angetreten">NH</span>`, null],
    ["ohne Namen (title) nichts", `Absage`, null],
    ["Ergebnis ist keine Ansetzung", `<a href="x?MeetingReport=1" title="Spielbericht">25:20</a>`, null],
  ];
  for (const [name, zelle, erwartet] of faelle) {
    it(name, () => {
      const r = parseAnsetzungen(tabelle(zelle));
      expect(r).toEqual(erwartet ? [{ spielnummer: 7, kuerzel: erwartet }] : []);
    });
  }
});

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
