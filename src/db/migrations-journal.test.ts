import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// drizzle-kit migrate wendet nur Migrationen an, deren "when" NEUER ist als die zuletzt angewendete. Ein kleineres "when" (z.B. echte
// Uhrzeit nach künstlich vergebenen Zeitstempeln) wird STILL übersprungen: Code erwartet dann Spalten, die es nie gab (18.10.2026, 0117).
describe("Migrations-Journal", () => {
  const journal = JSON.parse(readFileSync(join(__dirname, "migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string; when: number }[];
  };

  it("Zeitstempel (when) wachsen streng mit dem Index", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when, `${journal.entries[i].tag} muss neuer sein als ${journal.entries[i - 1].tag}`).toBeGreaterThan(
        journal.entries[i - 1].when
      );
    }
  });

  it("Indizes sind lückenlos", () => {
    journal.entries.forEach((e, i) => expect(e.idx).toBe(i));
  });
});
