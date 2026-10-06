// Reine Funktionen des Spieltags-Syncs: Fälligkeit der Spieltagsseiten (der DB-Sync ist in ndr/sync.test.ts getestet).
import { describe, expect, it } from "vitest";
import { berechneRundenMeta, rundeFaellig } from "./sync";

const jetzt = new Date("2025-10-04T15:00:00Z");

describe("Fälligkeit der Spieltagsseiten", () => {
  const meta = (extra: Partial<ReturnType<typeof berechneRundenMeta>> = {}) => ({ erstes: "2025-10-04", letztes: "2025-10-05", begonnen: 0, beendet: 0, gesamt: 9, ...extra });
  const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000);
  it("nie geholt = fällig (Erstimport)", () => {
    expect(rundeFaellig(undefined, jetzt, false)).toBe("nie");
    expect(rundeFaellig({ letzterErfolgAm: null, meta: null }, jetzt, false)).toBe("nie");
  });
  it("Spieltag steht an oder läuft: alle 10 Minuten", () => {
    expect(rundeFaellig({ letzterErfolgAm: vor(5), meta: meta({ begonnen: 3, beendet: 1 }) }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(11), meta: meta({ begonnen: 3, beendet: 1 }) }, jetzt, false)).toBe("heiss");
    expect(rundeFaellig({ letzterErfolgAm: vor(11), meta: meta() }, jetzt, false)).toBe("heiss");
  });
  it("weit entfernte Spieltage selten, abgeschlossene fast nie, Zuordnung ändert die Fälligkeit", () => {
    const fern = meta({ erstes: "2026-02-01", letztes: "2026-02-02" });
    expect(rundeFaellig({ letzterErfolgAm: vor(120), meta: fern }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(7 * 60), meta: fern }, jetzt, false)).toBe("offen");
    const fertig = meta({ erstes: "2025-09-01", letztes: "2025-09-02", begonnen: 9, beendet: 9 });
    expect(rundeFaellig({ letzterErfolgAm: vor(60 * 24), meta: fertig }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(60 * 24 * 8), meta: fertig }, jetzt, false)).toBe("ruhig");
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: fertig }, jetzt, true)).toBe("voll");
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: { ...fertig, zuordnung: "" } }, jetzt, false, "name:a")).toBe("nie");
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: { ...fertig, zuordnung: "name:a" } }, jetzt, false, "name:a")).toBeNull();
  });
});
