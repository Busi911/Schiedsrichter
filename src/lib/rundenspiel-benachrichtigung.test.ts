import { describe, expect, it } from "vitest";
import {
  rundenspielAenderungenInhalt,
  rundenspielAenderungZeilen,
} from "./rundenspiel-benachrichtigung";
import { zeileText } from "./email-layout";
import type { RundenspielAenderung } from "./rundenspiel-sync";

const verlegung: RundenspielAenderung = {
  terminId: "t1",
  start: new Date("2026-09-08T18:00:00Z"),
  ort: "Halle 2",
  heimMannschaft: "TV Musterstadt",
  auswaertsMannschaft: "Gastverein",
  kategorie: null,
  verlegt: true,
  ergebnisNeu: false,
  startAlt: new Date("2026-09-01T18:00:00Z"),
  ortAlt: "Halle 1",
  ergebnisHeim: null,
  ergebnisAuswaerts: null,
};

const ergebnis: RundenspielAenderung = {
  ...verlegung,
  verlegt: false,
  ergebnisNeu: true,
  ergebnisHeim: 28,
  ergebnisAuswaerts: 24,
};

const text = (a: RundenspielAenderung) => rundenspielAenderungZeilen(a).map(zeileText).join("\n");

describe("rundenspielAenderungZeilen", () => {
  it("zeigt den Spielnamen fett und eine Verlegung mit altem Termin", () => {
    const zeilen = rundenspielAenderungZeilen(verlegung);
    expect(zeilen[0]).toMatchObject({ text: "TV Musterstadt – Gastverein", stark: true });
    const t = text(verlegung);
    expect(t).toContain("Halle 2");
    expect(t).toContain("Verlegt, vorher:");
    expect(t).toContain("Halle 1");
    expect(t).not.toContain("Ergebnis");
  });

  it("zeigt die Kategorie in der Terminzeile, wenn bekannt", () => {
    expect(text({ ...verlegung, kategorie: "mJC" })).toContain("mJC · ");
  });

  it("zeigt ein neu eingetragenes Ergebnis", () => {
    expect(text(ergebnis)).toContain("Ergebnis: 28:24");
  });

  it("zeigt beides, wenn Verlegung und Ergebnis zusammenfallen", () => {
    const t = text({ ...verlegung, ergebnisNeu: true, ergebnisHeim: 28, ergebnisAuswaerts: 24 });
    expect(t).toContain("Verlegt, vorher:");
    expect(t).toContain("Ergebnis: 28:24");
  });
});

describe("rundenspielAenderungenInhalt", () => {
  it("verwendet Singular in der Überschrift bei genau einer Änderung", () => {
    const inhalt = rundenspielAenderungenInhalt("Musterverein", [verlegung]);
    expect(inhalt.ueberschrift).toContain("1 Änderung ");
    expect(inhalt.zeilen.length).toBeGreaterThan(1);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/admin/termine?tab=rundenspiele");
  });

  it("verwendet Plural bei mehreren Änderungen", () => {
    const inhalt = rundenspielAenderungenInhalt("Musterverein", [verlegung, ergebnis]);
    expect(inhalt.ueberschrift).toContain("2 Änderungen");
    expect(inhalt.zeilen.map(zeileText)).toContain("TV Musterstadt – Gastverein");
  });

  it("kürzt viele Änderungen auf 10 Spiele plus Hinweis", () => {
    const viele = Array.from({ length: 13 }, () => ergebnis);
    const inhalt = rundenspielAenderungenInhalt("Musterverein", viele);
    expect(inhalt.ueberschrift).toContain("13 Änderungen");
    expect(inhalt.zeilen.map(zeileText).filter((z) => z === "TV Musterstadt – Gastverein")).toHaveLength(10);
    expect(zeileText(inhalt.zeilen[inhalt.zeilen.length - 1])).toContain("3 weitere");
  });
});
