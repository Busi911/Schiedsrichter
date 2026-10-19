import { describe, expect, it, vi } from "vitest";
import { bewerteSpieltagsNaehe, rangMitVeraltung } from "./sync-cron";
import { FRIST_NACHLAUF_MS, mitHarterFrist, sortiereNachDringlichkeit } from "./sync-hilfen";

describe("mitHarterFrist", () => {
  it("gibt das Ergebnis eines rechtzeitigen Abrufs zurück", async () => {
    await expect(mitHarterFrist(Date.now() + 1_000, async () => "ok")).resolves.toBe("ok");
    await expect(mitHarterFrist(undefined, async () => "ok")).resolves.toBe("ok");
  });

  it("bricht einen hängenden Abruf nach Frist plus Nachlauf ab und meldet das Zeitlimit", async () => {
    vi.useFakeTimers();
    try {
      let gemeldet = false;
      const haengt = new Promise<string>(() => {});
      const ergebnis = mitHarterFrist(Date.now() + 1_000, () => haengt, () => (gemeldet = true));
      const erwartet = expect(ergebnis).rejects.toThrow(/Zeitlimit/);
      await vi.advanceTimersByTimeAsync(1_000 + FRIST_NACHLAUF_MS + 10);
      await erwartet;
      expect(gemeldet).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("startet nach abgelaufener Frist plus Nachlauf gar keinen Abruf mehr", async () => {
    const abruf = vi.fn(async () => "x");
    await expect(mitHarterFrist(Date.now() - FRIST_NACHLAUF_MS - 1, abruf)).rejects.toThrow(/Zeitlimit/);
    expect(abruf).not.toHaveBeenCalled();
  });
});

describe("sortiereNachDringlichkeit", () => {
  it("setzt Dringendes vor Älteres und sortiert sonst nach ältestem Zeitstempel", () => {
    const d = (h: number) => new Date(2026, 9, 3, h);
    const liste = [
      { n: "alt", d: 0, z: d(1) as Date | null },
      { n: "nie", d: 0, z: null },
      { n: "heute-neu", d: 1, z: d(9) },
      { n: "heute-alt", d: 1, z: d(2) },
    ];
    const r = sortiereNachDringlichkeit(liste, (x) => x.d, (x) => x.z).map((x) => x.n);
    expect(r).toEqual(["heute-alt", "heute-neu", "nie", "alt"]);
  });
});

describe("bewerteSpieltagsNaehe", () => {
  const heute = "2026-10-18";
  const spiel = (datum: string, status = "geplant", toreHeim: number | null = null, bestaetigt = false) => ({ datum, status, toreHeim, bestaetigt });

  it("Spiel heute = 3, vor allem anderen", () => {
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17"), spiel(heute)], heute)).toBe(3);
  });
  it("gestern gespielt ohne Ergebnis (auch Status gespielt) = 2", () => {
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17")], heute)).toBe(2);
    expect(bewerteSpieltagsNaehe([spiel("2026-10-16", "gespielt")], heute)).toBe(2);
  });
  it("gestern mit endgültigem Ergebnis oder nur morgen = 1", () => {
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17", "gespielt", 29, true)], heute)).toBe(1);
    expect(bewerteSpieltagsNaehe([spiel("2026-10-19")], heute)).toBe(1);
  });
  it("verlegtes Spiel (neuer Termin vorbei, kein Ergebnis) = 2, wie ein geplantes", () => {
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17", "verlegt")], heute)).toBe(2);
  });
  it("vorläufiges Ergebnis bleibt offen; abgesagt/nicht angetreten zählen nicht", () => {
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17", "gespielt", 29, false)], heute)).toBe(2);
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17", "abgesagt")], heute)).toBe(1);
    expect(bewerteSpieltagsNaehe([spiel("2026-10-17", "nicht_angetreten")], heute)).toBe(1);
  });
  it("keine Spiele im Fenster = 0", () => {
    expect(bewerteSpieltagsNaehe([], heute)).toBe(0);
  });
});

describe("rangMitVeraltung", () => {
  const jetzt = new Date("2026-10-19T10:00:00Z");
  it("hebt veraltete Vereine ohne Spieltagsnähe auf Rang 1", () => {
    expect(rangMitVeraltung(0, null, jetzt)).toBe(1);
    expect(rangMitVeraltung(0, new Date("2026-10-18T09:00:00Z"), jetzt)).toBe(1);
  });
  it("lässt frische Vereine und höhere Nähe unverändert", () => {
    expect(rangMitVeraltung(0, new Date("2026-10-19T04:00:00Z"), jetzt)).toBe(0);
    expect(rangMitVeraltung(3, null, jetzt)).toBe(3);
    expect(rangMitVeraltung(2, null, jetzt)).toBe(2);
  });
});
