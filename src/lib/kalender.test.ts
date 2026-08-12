import { describe, expect, it } from "vitest";
import {
  gruppiereProTag,
  monatKey,
  monatsBereich,
  monatsGitter,
  parseMonatParam,
  platziereBalken,
  tagKey,
} from "./kalender";

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

describe("gruppiereProTag", () => {
  it("gruppiert Einträge nach Kalendertag, Reihenfolge nach erstem Auftreten", () => {
    const items = [
      { id: "a", start: new Date("2026-09-05T08:00:00Z") },
      { id: "b", start: new Date("2026-09-05T10:00:00Z") },
      { id: "c", start: new Date("2026-09-06T08:00:00Z") },
    ];
    const gruppen = gruppiereProTag(items);
    expect(gruppen).toHaveLength(2);
    expect(gruppen[0].tag).toBe("2026-09-05");
    expect(gruppen[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(gruppen[1].tag).toBe("2026-09-06");
    expect(gruppen[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("liefert eine einzelne Gruppe bei eintägigen Spielplänen", () => {
    const items = [
      { id: "a", start: new Date("2026-09-05T08:00:00Z") },
      { id: "b", start: new Date("2026-09-05T10:00:00Z") },
    ];
    expect(gruppiereProTag(items)).toHaveLength(1);
  });

  it("liefert eine leere Liste für eine leere Eingabe", () => {
    expect(gruppiereProTag([])).toEqual([]);
  });
});

describe("platziereBalken", () => {
  // September 2026: Woche 0 = Mo 31.08.–So 06.09., Woche 1 = Mo 07.09.–So 13.09.
  const wochen = monatsGitter(2026, 8);

  it("platziert einen Balken innerhalb einer Woche mit korrekter Spalte/Spannweite", () => {
    const platziert = platziereBalken(wochen, [
      { id: "t1", label: "Turnier", startTag: "2026-09-02", endTag: "2026-09-04" },
    ]);
    // Mi=Spalte 3, Fr=Spalte 5 -> Spannweite 3
    expect(platziert[0]).toEqual([
      { id: "t1", label: "Turnier", startTag: "2026-09-02", endTag: "2026-09-04", startSpalte: 3, spannweite: 3, lane: 0 },
    ]);
    expect(platziert[1]).toEqual([]);
  });

  it("klammert einen wochenübergreifenden Balken pro Woche an die Wochengrenzen", () => {
    // Sa 05.09.–So 06.09. (Woche 0, Spalte 6–7), Mo 07.09.–Di 08.09. (Woche 1, Spalte 1–2)
    const platziert = platziereBalken(wochen, [
      { id: "t1", label: "Turnier", startTag: "2026-09-05", endTag: "2026-09-08" },
    ]);
    expect(platziert[0]).toMatchObject([{ startSpalte: 6, spannweite: 2 }]);
    expect(platziert[1]).toMatchObject([{ startSpalte: 1, spannweite: 2 }]);
  });

  it("weist überschneidenden Balken derselben Woche unterschiedliche Lanes zu", () => {
    const platziert = platziereBalken(wochen, [
      { id: "a", label: "A", startTag: "2026-09-01", endTag: "2026-09-03" },
      { id: "b", label: "B", startTag: "2026-09-02", endTag: "2026-09-05" },
    ]);
    const lanes = new Set(platziert[0].map((b) => b.lane));
    expect(lanes.size).toBe(2);
  });

  it("gibt nicht überschneidenden Balken dieselbe Lane", () => {
    const platziert = platziereBalken(wochen, [
      { id: "a", label: "A", startTag: "2026-09-01", endTag: "2026-09-02" },
      { id: "b", label: "B", startTag: "2026-09-03", endTag: "2026-09-04" },
    ]);
    expect(platziert[0].every((b) => b.lane === 0)).toBe(true);
  });

  it("ignoriert Balken außerhalb des Wochenbereichs", () => {
    const platziert = platziereBalken(wochen, [
      { id: "t1", label: "Turnier", startTag: "2026-11-01", endTag: "2026-11-03" },
    ]);
    expect(platziert.every((woche) => woche.length === 0)).toBe(true);
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
