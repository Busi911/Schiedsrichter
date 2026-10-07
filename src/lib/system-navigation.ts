import type { BottomNavIcon } from "@/components/bottom-nav";

// Aufbau des Systemadmin-Bereichs: wenige Bereiche in der Kopfzeile (und unten auf dem Handy), darunter je Bereich eine zweite Zeile mit den Unterseiten.
// Die Seiten selbst liegen unverändert unter /system/…; hier steht nur, was zusammengehört. Neue Seite: unter `unter` des passenden Bereichs eintragen.
export type SystemSeite = { href: string; label: string };
export type SystemBereich = { key: string; label: string; icon: BottomNavIcon; exact?: boolean; unter: SystemSeite[] };

export const SYSTEM_BEREICHE: SystemBereich[] = [
  { key: "uebersicht", label: "Übersicht", icon: "home", exact: true, unter: [{ href: "/system", label: "Übersicht" }] },
  {
    key: "vereine",
    label: "Vereine",
    icon: "vereine",
    unter: [
      { href: "/system/vereine", label: "Vereine" },
      { href: "/system/warteliste", label: "Warteliste" },
      { href: "/system/gesundheit", label: "Gesundheit" },
    ],
  },
  {
    key: "abrechnung",
    label: "Abrechnung",
    icon: "abrechnung",
    unter: [
      { href: "/system/abrechnung", label: "Abrechnung" },
      { href: "/system/sponsor", label: "Sponsor" },
    ],
  },
  {
    key: "spieldaten",
    label: "Spieldaten",
    icon: "spieldaten",
    unter: [
      { href: "/system/sync", label: "Liga-Sync" },
      { href: "/system/ndr", label: "Bundesliga" },
      { href: "/system/abgleich", label: "Abgleich" },
      { href: "/system/nuliga-diagnose", label: "nuLiga-Diagnose" },
    ],
  },
  {
    key: "betrieb",
    label: "Betrieb",
    icon: "betrieb",
    unter: [
      { href: "/system/feedback", label: "Feedback" },
      { href: "/system/mail", label: "Mail-Test" },
    ],
  },
];

export const seiteAktiv = (pathname: string | null, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || !!pathname?.startsWith(href + "/");

// Der Bereich, zu dem der aktuelle Pfad gehört (Übersicht nur auf /system selbst).
export function aktuellerBereich(pathname: string | null): SystemBereich | null {
  return (
    SYSTEM_BEREICHE.find((b) => (b.exact ? pathname === "/system" : b.unter.some((s) => seiteAktiv(pathname, s.href)))) ?? null
  );
}
