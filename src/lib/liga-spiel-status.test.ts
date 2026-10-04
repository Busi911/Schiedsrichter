import { describe, expect, it } from "vitest";
import { spielPhase } from "./liga-spiel-status";
import type { SpielAnsicht } from "./liga-spiele-hilfen";

const basis = {
  status: "geplant",
  toreHeim: null,
  toreGast: null,
  ergebnisBestaetigt: false,
  meetingId: null,
  berichtUrl: null,
} as unknown as SpielAnsicht;
const mit = (x: Partial<SpielAnsicht>) => ({ ...basis, ...x }) as SpielAnsicht;

describe("spielPhase", () => {
  it("geplant ohne Daten – auch wenn die Anwurfzeit vorbei ist, nie 'live'", () => {
    expect(spielPhase(basis)).toBe("geplant");
  });
  it("Spielbericht angelegt, aber noch kein Ergebnis", () => {
    expect(spielPhase(mit({ meetingId: "5" }))).toBe("bericht_angelegt");
  });
  it("Ergebnis: vorläufig vs. genehmigt", () => {
    expect(spielPhase(mit({ toreHeim: 20, toreGast: 18 }))).toBe("ergebnis_vorlaeufig");
    expect(spielPhase(mit({ toreHeim: 20, toreGast: 18, ergebnisBestaetigt: true }))).toBe("beendet");
  });
  it("abgesagt, verlegt, nicht angetreten haben Vorrang", () => {
    expect(spielPhase(mit({ status: "abgesagt", meetingId: "5" }))).toBe("abgesagt");
    expect(spielPhase(mit({ status: "verlegt" }))).toBe("verlegt");
    expect(spielPhase(mit({ status: "nicht_angetreten" }))).toBe("nicht_angetreten");
  });
});

import { laeuftVermutlich } from "./liga-spiel-status";
describe("laeuftVermutlich", () => {
  const anwurf = new Date("2026-10-04T15:00:00Z");
  const t = (min: number) => new Date(anwurf.getTime() + min * 60_000);
  it("nur mit Spielbericht, ohne Ergebnis und im Zeitfenster nach dem Anwurf", () => {
    const s = mit({ meetingId: "5", beginn: anwurf });
    expect(laeuftVermutlich(s, t(-5))).toBe(false);
    expect(laeuftVermutlich(s, t(10))).toBe(true);
    expect(laeuftVermutlich(s, t(121))).toBe(false);
  });
  it("Zeit allein genügt nicht, ein Ergebnis beendet die Vermutung", () => {
    expect(laeuftVermutlich(mit({ beginn: anwurf }), t(10))).toBe(false);
    expect(laeuftVermutlich(mit({ meetingId: "5", beginn: anwurf, toreHeim: 20, toreGast: 18 }), t(10))).toBe(false);
    expect(laeuftVermutlich(mit({ meetingId: "5", status: "abgesagt", beginn: anwurf }), t(10))).toBe(false);
  });
});
