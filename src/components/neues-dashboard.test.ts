import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClipboardCheckIcon } from "lucide-react";
import { BereichsTasten, NeuesDashboard, NeuesProfilStart } from "./neues-dashboard";
import type { NeuesDashboardDaten } from "@/lib/neues-dashboard-daten";

const spiel = { id: "t1", start: new Date("2026-10-18T12:00:00Z"), titel: "HSG A – HSG B", mannschaft: "männl. C-Jugend", ort: "Halle Süd" };
const basis: NeuesDashboardDaten = {
  hero: { art: "heute", anzahlHeute: 2, spiel, chips: [{ text: "Schiedsrichter ✓", offen: false }, { text: "Zeitnehmer fehlt", offen: true }] },
  naechster: spiel,
  spieleDieseWoche: 5,
  mannschaftenAnzahl: 12,
  mitgliederAnzahl: 214,
  offeneDienste: 3,
  aufgaben: [{ schluessel: "dienste", anzahl: 3, titel: "Termine mit offenen Diensten", hinweis: "nächste 7 Tage", href: "/admin/dienste", aktion: "Einteilen", ton: "warnung" }],
};
const rendere = (daten: NeuesDashboardDaten, opt: { vereinsverwaltung?: boolean; vereinstermine?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(NeuesDashboard, {
      daten,
      gruss: "Guten Abend, Sabine!",
      vereinName: "HSG Beispielstadt",
      rolle: "Vereinsadmin",
      vereinsverwaltung: opt.vereinsverwaltung ?? false,
      vereinstermine: opt.vereinstermine ?? false,
    })
  );

describe("NeuesDashboard", () => {
  it("zeigt Begrüßung, Heute-Karte mit Besetzung, Aufgaben und Bereiche", () => {
    const html = rendere(basis);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("Guten Abend, Sabine!");
    expect(html).toContain("2 Spiele heute");
    expect(html).toContain("HSG A – HSG B");
    expect(html).toContain("Zeitnehmer fehlt");
    expect(html).toContain("Termine mit offenen Diensten");
    expect(html).toContain('href="/admin/termine/t1"');
    expect(html).toContain("5 in dieser Woche");
    expect(html).toContain("12 Mannschaften");
    expect(html).toContain('href="/admin/bereich/dienste"');
    expect(html).toContain("3 offen");
  });
  it("Mitglieder und Vereinstermine nur mit Add-on bzw. Schalter", () => {
    expect(rendere(basis)).not.toContain("Mitglieder");
    expect(rendere(basis)).not.toContain("Vereinstermine");
    const mit = rendere(basis, { vereinsverwaltung: true, vereinstermine: true });
    expect(mit).toContain("214 Mitglieder");
    expect(mit).toContain("Vereinstermine");
  });
  it("ohne Spiele und Aufgaben: ruhige Zustände statt leerer Flächen", () => {
    const html = rendere({ ...basis, hero: { art: "keins", anzahlHeute: 0, spiel: null, chips: [] }, naechster: null, aufgaben: [], offeneDienste: 0, spieleDieseWoche: 0 });
    expect(html).toContain("Keine Spiele in Sicht");
    expect(html).toContain("Alles erledigt");
    expect(html).toContain("alles besetzt");
    expect(html).toContain("keine in dieser Woche");
  });
  it("nächstes Spiel, wenn heute keins mehr ansteht", () => {
    const html = rendere({ ...basis, hero: { art: "naechstes", anzahlHeute: 0, spiel, chips: [{ text: "Alles besetzt", offen: false }] } });
    expect(html).toContain("Nächstes Spiel");
    expect(html).not.toContain("Spiele heute");
  });
});

describe("BereichsTasten", () => {
  it("zeigt Name, Hinweis und Zähler als Tasten", () => {
    const html = renderToStaticMarkup(createElement(BereichsTasten, { eintraege: [{ href: "/admin/dienste", label: "Offene Dienste", hinweis: "alles, was noch fehlt", icon: ClipboardCheckIcon, badge: 3 }] }));
    expect(html).toContain('href="/admin/dienste"');
    expect(html).toContain("Offene Dienste");
    expect(html).toContain("3 offen");
  });
});

describe("NeuesProfilStart", () => {
  const rendereProfil = (hero: Parameters<typeof NeuesProfilStart>[0]["hero"]) =>
    renderToStaticMarkup(
      createElement(NeuesProfilStart, {
        gruss: "Guten Tag, Tim!",
        vereinName: "HSG Beispielstadt",
        rolleText: "Trainer",
        hero,
        aufgaben: [],
        kacheln: [{ href: "#kalender", label: "Kalender", hinweis: "Meine Einsätze", icon: ClipboardCheckIcon }],
      })
    );
  it("zeigt den nächsten Einsatz mit Rollen und Sprung zu den Terminen", () => {
    const html = rendereProfil({
      art: "einsatz",
      einsatz: { id: "t1", start: new Date("2026-10-18T12:00:00Z"), titel: "HSG A – HSG B", ort: "Halle Süd", rollen: ["Zeitnehmer"] },
      anzahl7Tage: 2,
      heute: false,
    });
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("Dein nächster Einsatz");
    expect(html).toContain("HSG A – HSG B");
    expect(html).toContain("Zeitnehmer");
    expect(html).toContain("2 in 7 Tagen");
    expect(html).toContain('href="#meine-termine"');
  });
  it("ohne Einsatz: Leerzustand mit Link zum Kalender", () => {
    const html = rendereProfil({ art: "keins", einsatz: null, anzahl7Tage: 0, heute: false });
    expect(html).toContain("Gerade nichts eingetragen");
    expect(html).toContain('href="#kalender"');
  });
});
