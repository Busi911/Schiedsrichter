import { describe, expect, it, vi } from "vitest";
import { pruefeAlleQuellen, pruefeHandballNet, schreibeStandFort, type QuellenPruefung } from "./quellen-test";
import { pruefeSync, SCHWELLEN, type Snapshot, type TestStand } from "./sync-ueberwachung";

vi.mock("server-only", () => ({}));

const JETZT = new Date("2026-11-01T12:00:00Z");
const nichts = async () => {
  throw new Error("HTTP 403");
};
const basis = { jetzt: JETZT, holeJson: nichts, holeHtml: nichts, holeNdr: nichts, handballNetClubId: null, nuligaClubId: null };

describe("pruefeHandballNet", () => {
  it("meldet 403 der Saisonliste als Fehler, ohne dass der Test abstürzt", async () => {
    const r = await pruefeHandballNet(basis);
    const saisons = r.find((p) => p.schluessel === "handball_net:saisons")!;
    expect(saisons.ok).toBe(false);
    expect(saisons.optional).toBe(true);
    expect(saisons.detail).toContain("HTTP 403");
  });

  it("Antwort ohne lesbare Saisons (geändertes Format) ist ein Fehler", async () => {
    const r = await pruefeHandballNet({ ...basis, holeJson: async () => ({ data: [{ foo: 1 }] }) });
    expect(r[0].ok).toBe(false);
    expect(r[0].detail).toContain("Format");
  });

  it("ohne Verein mit handball.net-ID werden Folgeschritte übersprungen, nicht als Fehler gezählt", async () => {
    const r = await pruefeHandballNet({ ...basis, holeJson: async () => ({ data: [] }), handballNetClubId: null });
    expect(r.filter((p) => p.uebersprungen).map((p) => p.schluessel)).toEqual(["handball_net:teams", "handball_net:wettbewerbe", "handball_net:spiele"]);
  });

  it("Teamliste, die in allen Pfaden scheitert, ist ein Fehler mit den Pfaden im Detail", async () => {
    const r = await pruefeHandballNet({ ...basis, handballNetClubId: "club.1", holeJson: async (pfad) => (pfad.includes("/seasons") ? { data: [] } : Promise.reject(new Error("HTTP 404"))) });
    const teams = r.find((p) => p.schluessel === "handball_net:teams")!;
    expect(teams.ok).toBe(false);
    expect(teams.detail).toContain("HTTP 404");
  });
  it("testet nach Saisonfehler weiterhin die Teamliste und benutzt nur den belegten Pfad", async () => {
    const aufrufe: string[] = [];
    await pruefeHandballNet({ ...basis, handballNetClubId: "club.1", holeJson: async (pfad) => {
      aufrufe.push(pfad);
      if (pfad.includes("/seasons")) throw new Error("HTTP 403");
      return { data: [] };
    } });
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1]).toContain("/api/new/teams?club_id=club.1");
    expect(aufrufe.some((p) => p.includes("/teams/clubs/") || p.includes("/clubs/"))).toBe(false);
  });

});

describe("pruefeAlleQuellen", () => {
  it("fängt Fehler je Quelle einzeln ab und liefert alle Prüfungen", async () => {
    const r = await pruefeAlleQuellen({ ...basis, nuligaClubId: "76446" });
    expect(r.map((p) => p.quelle)).toEqual(expect.arrayContaining(["handball_net", "nuliga", "ndr"]));
    expect(r.filter((p) => p.quelle === "ndr")).toHaveLength(2);
    expect(r.filter((p) => !p.uebersprungen).every((p) => !p.ok)).toBe(true);
  });

  it("leere NDR-Seite gilt als Fehler (Format geändert)", async () => {
    const r = await pruefeAlleQuellen({ ...basis, holeNdr: async () => "<html><body>Wartung</body></html>" });
    expect(r.find((p) => p.schluessel === "ndr:hbl1")?.ok).toBe(false);
  });
});

describe("schreibeStandFort / Überwachung", () => {
  const p = (ok: boolean, uebersprungen = false): QuellenPruefung => ({ schluessel: "handball_net:teams", quelle: "handball_net", name: "x", ok, uebersprungen, dauerMs: 1, detail: ok ? "ok" : "HTTP 403" });

  it("zählt Fehler in Folge, setzt bei Erfolg zurück, ignoriert Übersprungenes", () => {
    const a = schreibeStandFort(undefined, p(false), JETZT)!;
    const b = schreibeStandFort(a, p(false), JETZT)!;
    expect(b.fehlerInFolge).toBe(2);
    expect(b.letzterErfolgAm).toBeNull();
    expect(schreibeStandFort(b, p(true), JETZT)!.fehlerInFolge).toBe(0);
    expect(schreibeStandFort(b, p(false, true), JETZT)).toBeNull();
  });

  const snap = (t: TestStand[]): Snapshot => ({ jetzt: JETZT, quellentests: t, vereine: [], ndrSeiten: [], ansetzung: { gruppen: 0, neuesteAm: null } });
  const stand = (schluessel: string, n: number): TestStand => ({ schluessel, letzterVersuchAm: JETZT, letzterErfolgAm: null, fehlerInFolge: n, letzterFehler: "HTTP 403" });

  it("alarmiert nicht wegen einer optionalen Saisonliste, aber weiter wegen einer kaputten Teamliste", () => {
    expect(pruefeSync(snap([stand("handball_net:saisons", 9)]))).toEqual([]);
    expect(pruefeSync(snap([stand("handball_net:saisons", 9), stand("handball_net:teams", 2)]))[0].betroffen).toEqual(["handball_net:teams"]);
  });

  it("meldet erst ab zwei Fehlschlägen in Folge, je Quelle getrennt", () => {
    expect(pruefeSync(snap([stand("handball_net:teams", SCHWELLEN.quellentestFehlerInFolge - 1)]))).toEqual([]);
    const befunde = pruefeSync(snap([stand("handball_net:teams", 2), stand("handball_net:spiele", 3), stand("ndr:hbl1", 1)]));
    expect(befunde.map((b) => b.gruppe)).toEqual(["quellentest-handball_net"]);
    expect(befunde[0].betroffen).toEqual(["handball_net:teams", "handball_net:spiele"]);
    expect(befunde[0].titel).toContain("handball.net");
  });
});
