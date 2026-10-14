// Die Wart-Seiten liegen unter /profil (dort arbeiten auch Warte ohne Admin-Rechte); Admins kamen bisher nur über
// "Mein Profil" hin. Im Admin-Menü (Desktop-Dropdown in admin-nav.tsx, "Mehr" auf dem Handy in admin/(dashboard)/layout.tsx)
// nur für volle Admins: "nur lesend" darf die Wart-Seiten nicht öffnen.
export type WartItem = { href: string; label: string };

// Alle vier Wart-Seiten, auch der Dienstwart (eigene Dienste wie Fahrer, Kuchen): Admins sehen ihn immer, wie die anderen
// Warte; ohne angelegte eigene Dienste verweist die Seite auf Einstellungen → Dienste.
export const WART_ITEMS: WartItem[] = [
  { href: "/profil/schiedsrichterwart", label: "Schiedsrichterwart" },
  { href: "/profil/zeitnehmerwart", label: "Zeitnehmer-/Sekretärwart" },
  { href: "/profil/ordnerwart", label: "Ordnerwart" },
  { href: "/profil/dienstwart", label: "Dienstwart (eigene Dienste)" },
];
