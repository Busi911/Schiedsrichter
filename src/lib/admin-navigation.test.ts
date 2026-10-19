import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baueAdminNavigation, mobileNavigation } from "./admin-navigation";
import { WART_ITEMS } from "./wart-navigation";

const alle = { vereinstermine: true, vereinsverwaltung: true, warte: WART_ITEMS, offeneDienste: 19 };
const hrefs = (nav: ReturnType<typeof baueAdminNavigation>) => [...nav.direkt, ...nav.gruppen.flatMap((g) => g.eintraege), ...nav.konto].map((e) => e.href);

describe("baueAdminNavigation", () => {
  it("Gruppen in fester thematischer Reihenfolge", () => {
    expect(baueAdminNavigation(alle).gruppen.map((g) => g.titel)).toEqual(["Spielbetrieb", "Dienste", "Verein", "Auswertung"]);
  });
  it("Add-on-Einträge nur mit Schalter, leere Gruppe entfällt", () => {
    const ohne = baueAdminNavigation({ vereinstermine: false, vereinsverwaltung: false, warte: [] });
    expect(ohne.gruppen.map((g) => g.id)).toEqual(["spielbetrieb", "dienste", "auswertung"]);
    expect(hrefs(ohne)).not.toContain("/admin/mitglieder");
    const nurTermine = baueAdminNavigation({ vereinstermine: true, vereinsverwaltung: false, warte: [] });
    expect(nurTermine.gruppen.find((g) => g.id === "verein")?.eintraege.map((e) => e.href)).toEqual(["/admin/vereinstermine"]);
    expect(hrefs(baueAdminNavigation(alle))).toContain("/admin/mitglieder");
  });
  it("Wart-Seiten nur für volle Admins (warte gesetzt), unter 'Dienste einteilen'", () => {
    const dienste = (n: ReturnType<typeof baueAdminNavigation>) => n.gruppen.find((g) => g.id === "dienste")!.eintraege;
    expect(dienste(baueAdminNavigation({ ...alle, warte: [] })).some((e) => e.href.startsWith("/profil/"))).toBe(false);
    const mit = dienste(baueAdminNavigation(alle)).filter((e) => e.href.startsWith("/profil/"));
    expect(mit).toHaveLength(WART_ITEMS.length);
    expect(mit.every((e) => e.abschnitt === "Dienste einteilen")).toBe(true);
  });
  it("jedes Ziel kommt genau einmal vor, Konto enthält Einstellungen, Profil, Hilfe", () => {
    const h = hrefs(baueAdminNavigation(alle));
    expect(new Set(h).size).toBe(h.length);
    expect(baueAdminNavigation(alle).konto.map((e) => e.href)).toEqual(["/admin/einstellungen", "/profil", "/profil/darstellung", "/hilfe"]);
  });
  it("Badge der offenen Dienste hängt am Eintrag 'Offene Dienste'", () => {
    const e = baueAdminNavigation(alle).gruppen.flatMap((g) => g.eintraege).find((x) => x.href === "/admin/dienste");
    expect(e?.badge).toBe(19);
  });
  it("alle Admin-Ziele gibt es als Seite", () => {
    for (const h of hrefs(baueAdminNavigation(alle))) {
      if (h === "/admin") continue;
      const pfad = h.startsWith("/admin/") ? join(__dirname, "../app/admin/(dashboard)", h.slice("/admin/".length), "page.tsx") : join(__dirname, "../app", h, "page.tsx");
      expect(existsSync(pfad), h).toBe(true);
    }
  });
});

describe("mobileNavigation", () => {
  it("Tabs: Übersicht, Kalender, Spiele; Spiele & Turniere steht nicht doppelt im Sheet", () => {
    const m = mobileNavigation(baueAdminNavigation(alle));
    expect(m.tabs.map((t) => t.label)).toEqual(["Übersicht", "Kalender", "Spiele"]);
    expect(m.mehr.some((e) => e.href === "/admin/termine")).toBe(false);
  });
  it("Sheet nach denselben Themen, Wart-Seiten als eigener Abschnitt, Konto zuletzt", () => {
    const m = mobileNavigation(baueAdminNavigation(alle));
    const titel = m.mehr.map((e) => e.gruppe).filter((g, i, a) => a.indexOf(g) === i);
    expect(titel).toEqual(["Spielbetrieb", "Dienste", "Dienste einteilen", "Verein", "Auswertung", "Einstellungen & Konto"]);
    expect(m.mehr.find((e) => e.href === "/admin/dienste")?.badge).toBe(19);
  });
});
