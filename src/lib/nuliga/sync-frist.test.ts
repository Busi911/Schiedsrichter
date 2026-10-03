import { describe, expect, it, vi } from "vitest";
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
