import { describe, expect, it } from "vitest";
import { entscheideMeldung, pruefeSync, SCHWELLEN, type Befund, type Snapshot, type VereinSync } from "./sync-ueberwachung";

const JETZT = new Date("2026-10-18T12:00:00Z");
const vor = (h: number) => new Date(JETZT.getTime() - h * 3_600_000);

const verein = (id: string, v: Partial<VereinSync> = {}): VereinSync => ({
  id, name: `Verein ${id}`, nuliga: true, handballNet: false, erstelltAm: vor(24 * 100),
  spieleAm: vor(2), handballNetAm: null, uebernahmeAktiv: true, uebernahmeGeprueftAm: vor(1), laeufe: [], ...v,
});
const snap = (vereine: VereinSync[], rest: Partial<Snapshot> = {}): Snapshot => ({ jetzt: JETZT, vereine, ndrSeiten: [], ansetzung: { gruppen: 0, neuesteAm: null }, ...rest });

describe("pruefeSync", () => {
  it("gesunde Lage: keine Befunde", () => {
    expect(pruefeSync(snap([verein("a"), verein("b", { nuliga: false, handballNet: true, handballNetAm: vor(3) })]))).toEqual([]);
  });

  it("nuLiga: Verein ohne Erfolg seit über 24 Stunden, ein neuer Verein und ein Verein ohne nuLiga zählen nicht", () => {
    const befunde = pruefeSync(snap([
      verein("alt", { spieleAm: vor(30) }),
      verein("nie", { spieleAm: null }),
      verein("neu", { spieleAm: null, erstelltAm: vor(3) }),
      verein("ohne", { nuliga: false, spieleAm: vor(99) }),
      verein("gut"),
    ]));
    expect(befunde).toHaveLength(1);
    expect(befunde[0].gruppe).toBe("nuliga-veraltet");
    expect(befunde[0].betroffen.sort()).toEqual(["alt", "nie"]);
    expect(befunde[0].titel).toContain("2 Vereine");
    expect(befunde[0].zeilen.join(" ")).toContain("zuletzt vor 30 Std.");
    expect(befunde[0].zeilen.join(" ")).toContain("noch nie");
  });

  it("Fehler in Folge: erst ab drei, nur gleiche Art", () => {
    const l = (art: string, status: string, h: number) => ({ art, status, gestartetAm: vor(h) });
    const befunde = pruefeSync(snap([
      verein("drei", { laeufe: [l("spiele", "fehler", 1), l("spiele", "fehler", 2), l("spiele", "fehler", 3)] }),
      verein("zwei", { laeufe: [l("spiele", "fehler", 1), l("spiele", "fehler", 2), l("spiele", "erfolgreich", 3)] }),
      verein("gemischt", { laeufe: [l("spiele", "fehler", 1), l("struktur", "fehler", 2), l("spiele", "fehler", 3)] }),
    ]));
    expect(befunde.find((b) => b.gruppe === "nuliga-fehler")?.betroffen).toEqual(["drei"]);
  });

  it("handball.net getrennt von nuLiga", () => {
    const befunde = pruefeSync(snap([verein("h", { nuliga: false, handballNet: true, handballNetAm: vor(40) })]));
    expect(befunde.map((b) => b.gruppe)).toEqual(["hnet-veraltet"]);
  });

  it("NDR: nur Seiten mit letztem Fehlversuch und über 6 Stunden ohne Erfolg, gruppiert je Liga", () => {
    const seite = (schluessel: string, versuch: number, erfolg: number | null, fehler: string | null) => ({
      schluessel, letzterVersuchAm: vor(versuch), letzterErfolgAm: erfolg === null ? null : vor(erfolg), letzterFehler: fehler,
    });
    const befunde = pruefeSync(snap([], { ndrSeiten: [
      seite("ndr:hbl2:2026/27:md7", 1, 9, "HTTP 503"),
      seite("ndr:hbl2:2026/27:md8", 1, null, "Timeout"),
      seite("ndr:hbl1:2026/27:md3", 1, 2, "HTTP 500"), // erst 2 Std. ohne Erfolg
      seite("ndr:hbl1:2026/27:md4", 5, 1, null), // kein Fehler
      seite("ndr:hbl1:2026/27:md5", 8, 7, "alter Fehler"), // danach wieder erfolgreich (Erfolg jünger als der Versuch mit Fehler)
    ] }));
    expect(befunde.map((b) => b.gruppe)).toEqual(["ndr-hbl2"]);
    expect(befunde.find((b) => b.gruppe === "ndr-hbl2")?.betroffen).toHaveLength(2);
    expect(befunde.find((b) => b.gruppe === "ndr-hbl2")?.zeilen.join(" ")).toContain("md7: HTTP 503");
  });

  it("Übernahme und Ansetzung", () => {
    const befunde = pruefeSync(snap([verein("u", { uebernahmeGeprueftAm: vor(40) }), verein("aus", { uebernahmeAktiv: false, uebernahmeGeprueftAm: vor(99) })], { ansetzung: { gruppen: 12, neuesteAm: vor(30) } }));
    expect(befunde.map((b) => b.gruppe).sort()).toEqual(["ansetzung-veraltet", "uebernahme-veraltet"]);
    expect(befunde.find((b) => b.gruppe === "uebernahme-veraltet")?.betroffen).toEqual(["u"]);
    expect(pruefeSync(snap([], { ansetzung: { gruppen: 0, neuesteAm: null } }))).toEqual([]);
  });

  it("lange Listen werden gekürzt", () => {
    const viele = Array.from({ length: 15 }, (_, i) => verein(`v${i}`, { spieleAm: vor(50) }));
    const b = pruefeSync(snap(viele))[0];
    expect(b.zeilen).toHaveLength(SCHWELLEN.maxNamen + 1);
    expect(b.zeilen.at(-1)).toBe("… und 5 weitere");
    expect(b.betroffen).toHaveLength(15);
  });
});

describe("entscheideMeldung", () => {
  const befund = (gruppe: string, betroffen: string[]): Befund => ({ gruppe, titel: gruppe, zeilen: [], betroffen });

  it("neuer Befund wird gemeldet und gemerkt", () => {
    const e = entscheideMeldung({}, [befund("a", ["1"])], JETZT);
    expect(e.senden.map((b) => b.gruppe)).toEqual(["a"]);
    expect(e.zustand.a).toEqual({ betroffen: ["1"], gemeldetAm: JETZT.toISOString() });
  });
  it("derselbe Befund bleibt stumm, bis die Erinnerung fällig ist", () => {
    const vorher = { a: { betroffen: ["1"], gemeldetAm: vor(5).toISOString() } };
    const still = entscheideMeldung(vorher, [befund("a", ["1"])], JETZT);
    expect(still.senden).toEqual([]);
    expect(still.zustand.a.gemeldetAm).toBe(vor(5).toISOString());
    const erinnerung = entscheideMeldung({ a: { betroffen: ["1"], gemeldetAm: vor(25).toISOString() } }, [befund("a", ["1"])], JETZT);
    expect(erinnerung.senden).toHaveLength(1);
  });
  it("weitere Betroffene lösen sofort eine Meldung aus, weniger Betroffene nicht", () => {
    const vorher = { a: { betroffen: ["1", "2"], gemeldetAm: vor(1).toISOString() } };
    expect(entscheideMeldung(vorher, [befund("a", ["1", "2", "3"])], JETZT).senden).toHaveLength(1);
    const weniger = entscheideMeldung(vorher, [befund("a", ["1"])], JETZT);
    expect(weniger.senden).toEqual([]);
    expect(weniger.zustand.a.betroffen).toEqual(["1"]);
  });
  it("behobene Gruppen werden einmal gemeldet und vergessen", () => {
    const vorher = { a: { betroffen: ["1"], gemeldetAm: vor(1).toISOString() } };
    const e = entscheideMeldung(vorher, [], JETZT);
    expect(e.behoben).toEqual(["a"]);
    expect(e.zustand).toEqual({});
  });
});
