// Navigation des Admin-Bereichs: die EINE Quelle für Desktop (admin-nav.tsx) und Handy (BottomNav in admin/(dashboard)/layout.tsx).
// Thematisch gruppiert: Übersicht · Kalender · Spielbetrieb · Dienste · Verein · Auswertung; Einstellungen, Profil und Hilfe gehören zum Konto.
import type { BottomNavIcon } from "@/components/bottom-nav";
import type { WartItem } from "@/lib/wart-navigation";

export type AdminNavEintrag = {
  href: string;
  label: string;
  // Kurzer Name für die Tab-Leiste auf dem Handy (sonst `label`).
  kurz?: string;
  icon: BottomNavIcon;
  exact?: boolean;
  // Auf dem Handy als eigener Tab statt im "Mehr"-Sheet (häufigste Einstiege).
  mobilTab?: boolean;
  // Nur mit eingeschaltetem Add-on bzw. Schalter sichtbar.
  nur?: "vereinstermine" | "vereinsverwaltung";
  // Zwischenüberschrift innerhalb einer Gruppe (Dropdown und Sheet).
  abschnitt?: string;
  badge?: number;
};

export type AdminNavGruppe = { id: string; titel: string; eintraege: AdminNavEintrag[] };

export type AdminNavigation = {
  direkt: AdminNavEintrag[];
  gruppen: AdminNavGruppe[];
  konto: AdminNavEintrag[];
};

const DIREKT: AdminNavEintrag[] = [
  { href: "/admin", label: "Übersicht", icon: "home", exact: true, mobilTab: true },
  { href: "/admin/kalender", label: "Kalender", icon: "kalender", mobilTab: true },
];

// Auf dem Handy bleibt "Spiele & Turniere" als Tab sichtbar (häufigster Einstieg nach dem Kalender), am Desktop steht es unter "Spielbetrieb".
const GRUPPEN: AdminNavGruppe[] = [
  {
    id: "spielbetrieb",
    titel: "Spielbetrieb",
    eintraege: [
      { href: "/admin/termine", label: "Spiele & Turniere", kurz: "Spiele", icon: "termine", mobilTab: true },
      { href: "/admin/mannschaften", label: "Mannschaften", icon: "mannschaften" },
      { href: "/admin/trainingsplan", label: "Trainingsplan", icon: "training" },
    ],
  },
  {
    id: "dienste",
    titel: "Dienste",
    eintraege: [
      { href: "/admin/dienste", label: "Offene Dienste", icon: "dienste" },
      { href: "/admin/funktionstraeger", label: "Funktionsträger", icon: "funktionstraeger" },
    ],
  },
  {
    id: "verein",
    titel: "Verein",
    eintraege: [
      { href: "/admin/vereinstermine", label: "Vereinstermine", icon: "termine", nur: "vereinstermine" },
      { href: "/admin/mitglieder", label: "Mitglieder", icon: "funktionstraeger", nur: "vereinsverwaltung" },
    ],
  },
  {
    id: "auswertung",
    titel: "Auswertung",
    eintraege: [
      { href: "/admin/statistik", label: "Statistik", icon: "statistik" },
      { href: "/admin/auswertung", label: "Auswertung & Export", icon: "auswertung" },
    ],
  },
];

const KONTO: AdminNavEintrag[] = [
  { href: "/admin/einstellungen", label: "Einstellungen", icon: "einstellungen" },
  { href: "/profil", label: "Mein Profil", icon: "profil" },
  { href: "/hilfe", label: "Hilfe", icon: "hilfe" },
];

export const KONTO_TITEL = "Einstellungen & Konto";

/**
 * Baut die Navigation für diesen Verein und diese Person. Einträge mit Add-on/Schalter erscheinen nur, wenn er an ist; die Wart-Seiten (Dienste einteilen)
 * nur für volle Admins (`warte`, siehe lib/wart-navigation.ts); eine Gruppe ohne sichtbare Einträge entfällt.
 */
export function baueAdminNavigation(opt: { vereinstermine: boolean; vereinsverwaltung: boolean; warte: WartItem[]; offeneDienste?: number }): AdminNavigation {
  const sichtbar = (e: AdminNavEintrag) => !e.nur || opt[e.nur];
  const gruppen = GRUPPEN.map((g) => {
    const eintraege: AdminNavEintrag[] = g.eintraege.filter(sichtbar).map((e) => (e.href === "/admin/dienste" && opt.offeneDienste ? { ...e, badge: opt.offeneDienste } : e));
    if (g.id === "dienste") {
      eintraege.push(...opt.warte.map((w): AdminNavEintrag => ({ href: w.href, label: w.label, icon: "wart", abschnitt: "Dienste einteilen" })));
    }
    return { ...g, eintraege };
  }).filter((g) => g.eintraege.length > 0);
  return { direkt: DIREKT, gruppen, konto: KONTO };
}

/** Handy: Tabs (Einträge mit `mobilTab`, in Reihenfolge Übersicht, Kalender, Spiele) und "Mehr"-Sheet (alles andere, nach Themen, dann Konto). */
export function mobileNavigation(nav: AdminNavigation) {
  const alle = [...nav.direkt, ...nav.gruppen.flatMap((g) => g.eintraege)];
  const tabs = alle.filter((e) => e.mobilTab).map((e) => ({ href: e.href, label: e.kurz ?? e.label, icon: e.icon, exact: e.exact }));
  const mehr: { href: string; label: string; icon: BottomNavIcon; badge?: number; gruppe: string }[] = [
    ...nav.gruppen.flatMap((g) => g.eintraege.filter((e) => !e.mobilTab).map((e) => ({ href: e.href, label: e.label, icon: e.icon, badge: e.badge, gruppe: e.abschnitt ?? g.titel }))),
    ...nav.konto.map((e) => ({ href: e.href, label: e.label, icon: e.icon, gruppe: KONTO_TITEL })),
  ];
  return { tabs, mehr };
}
