import { describe, expect, it } from "vitest";
import { monatKey, monatsBereich, monatsGitter, parseMonatParam, tagKey } from "./kalender";

describe("tagKey", () => {
  it("formatiert als YYYY-MM-DD", () => {
    expect(tagKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });

  it("ordnet einem Zeitpunkt kurz nach Mitternacht Berliner Zeit den korrekten (nächsten) Tag zu", () => {
    // Regression: getFullYear()/getMonth()/getDate() ohne Zeitzonen-Behandlung
    // würden auf einem UTC-Server (Vercel) diesen Zeitpunkt noch dem 25.
    // zuordnen, obwohl er in Berlin (Sommerzeit) bereits am 26. liegt.
    expect(tagKey(new Date("2026-08-25T23:30:00Z"))).toBe("2026-08-26");
  });
});

describe("monatKey", () => {
  it("formatiert als YYYY-MM (1-basiert)", () => {
    expect(monatKey(2026, 0)).toBe("2026-01");
    expect(monatKey(2026, 11)).toBe("2026-12");
  });
});

describe("parseMonatParam", () => {
  it("parst einen gültigen Monats-Parameter", () => {
    expect(parseMonatParam("2026-09")).toEqual({ jahr: 2026, monatNull: 8 });
  });

  it("fällt bei fehlendem/ungültigem Wert auf den aktuellen Monat zurück", () => {
    const jetzt = new Date(2026, 4, 15);
    expect(parseMonatParam(undefined, jetzt)).toEqual({ jahr: 2026, monatNull: 4 });
    expect(parseMonatParam("nicht-valide", jetzt)).toEqual({ jahr: 2026, monatNull: 4 });
    expect(parseMonatParam("2026-13", jetzt)).toEqual({ jahr: 2026, monatNull: 4 });
  });
});

describe("monatsBereich", () => {
  it("liefert ersten und letzten Tag des Monats", () => {
    const { von, bis } = monatsBereich(2026, 1); // Februar 2026 (kein Schaltjahr)
    expect(von.getDate()).toBe(1);
    expect(von.getMonth()).toBe(1);
    expect(bis.getDate()).toBe(28);
    expect(bis.getMonth()).toBe(1);
  });
});

describe("monatsGitter", () => {
  it("beginnt jede Woche mit Montag", () => {
    const wochen = monatsGitter(2026, 8); // September 2026
    for (const woche of wochen) {
      expect(woche[0].datum.getDay()).toBe(1); // Montag
      expect(woche).toHaveLength(7);
    }
  });

  it("markiert genau die Tage des Zielmonats als imMonat", () => {
    const wochen = monatsGitter(2026, 8); // September hat 30 Tage
    const imMonatTage = wochen.flat().filter((t) => t.imMonat);
    expect(imMonatTage).toHaveLength(30);
    expect(imMonatTage[0].datum.getDate()).toBe(1);
    expect(imMonatTage[imMonatTage.length - 1].datum.getDate()).toBe(30);
  });

  it("entfernt überschüssige Wochen am Ende, die komplett außerhalb liegen", () => {
    const wochen = monatsGitter(2026, 8);
    const letzteWoche = wochen[wochen.length - 1];
    expect(letzteWoche.some((t) => t.imMonat)).toBe(true);
  });

  it("markiert 'heute' korrekt", () => {
    const heute = new Date(2026, 8, 15);
    const wochen = monatsGitter(2026, 8, heute);
    const heuteTage = wochen.flat().filter((t) => t.heute);
    expect(heuteTage).toHaveLength(1);
    expect(heuteTage[0].datum.getDate()).toBe(15);
  });
});
