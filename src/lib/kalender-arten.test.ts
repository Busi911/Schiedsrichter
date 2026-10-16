import { describe, expect, it } from "vitest";
import { kalenderArtenZusatz, parseKalenderArten, schalteKalenderArt } from "./kalender-arten";
import { trainingsImZeitraum } from "./training-ausfall";
import { mischeNachZeit } from "./kalender";

describe("Kalender-Arten", () => {
  it("ohne Angabe oder mit Unsinn sind alle Arten sichtbar", () => {
    expect([...parseKalenderArten(undefined)].sort()).toEqual(["spiele", "training", "verein"]);
    expect([...parseKalenderArten("quatsch,,")].sort()).toEqual(["spiele", "training", "verein"]);
  });
  it("liest eine Auswahl und ignoriert Unbekanntes", () => {
    expect([...parseKalenderArten("training, verein ,x")].sort()).toEqual(["training", "verein"]);
  });
  it("Linkzusatz nur bei eingeschränkter Auswahl, in fester Reihenfolge", () => {
    expect(kalenderArtenZusatz(parseKalenderArten(undefined))).toBe("");
    expect(kalenderArtenZusatz(new Set(["verein", "spiele"] as const))).toBe("&zeige=spiele,verein");
  });
  it("Ein-/Ausschalten, aber nie alles aus", () => {
    const alle = parseKalenderArten(undefined);
    expect([...schalteKalenderArt(alle, "training")].sort()).toEqual(["spiele", "verein"]);
    const nurEine = new Set(["verein"] as const);
    expect([...schalteKalenderArt(nurEine, "verein")]).toEqual(["verein"]);
    expect([...schalteKalenderArt(nurEine, "spiele")].sort()).toEqual(["spiele", "verein"]);
  });
});

describe("trainingsImZeitraum", () => {
  const z = { id: "a", mannschaftId: "m", halleId: "h", wochentag: 3, startMinuten: 1080, endMinuten: 1170, abteilNummer: null, farbe: "#000" };
  it("liefert alle Trainings eines Monats mit Ausfällen, auch vergangene", () => {
    const l = trainingsImZeitraum([z], [{ trainingszeitId: "a", datum: "2026-10-15", grund: "Ferien" }], "2026-10-01", "2026-10-31");
    expect(l.map((t) => t.datum)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
    expect(l.find((t) => t.datum === "2026-10-15")).toMatchObject({ ausgefallen: true, grund: "Ferien" });
    expect(l.filter((t) => t.ausgefallen)).toHaveLength(1);
  });
  it("leer, wenn bis vor von liegt", () => {
    expect(trainingsImZeitraum([z], [], "2026-10-10", "2026-10-01")).toEqual([]);
  });
});

describe("mischeNachZeit", () => {
  it("mischt je Tag nach Uhrzeit und lässt die Eingabe unverändert", () => {
    const basis = new Map([["2026-10-22", [{ zeit: "15:00", id: "spiel" }]], ["2026-10-23", [{ zeit: "10:00", id: "x" }]]]);
    const zusatz = new Map([["2026-10-22", [{ zeit: "18:00", id: "training" }, { zeit: "09:00", id: "frueh" }]], ["2026-10-24", [{ zeit: "11:00", id: "neu" }]]]);
    const ergebnis = mischeNachZeit(basis, zusatz);
    expect(ergebnis.get("2026-10-22")?.map((e) => e.id)).toEqual(["frueh", "spiel", "training"]);
    expect(ergebnis.get("2026-10-23")?.map((e) => e.id)).toEqual(["x"]);
    expect(ergebnis.get("2026-10-24")?.map((e) => e.id)).toEqual(["neu"]);
    expect(basis.get("2026-10-22")).toHaveLength(1);
  });
});
