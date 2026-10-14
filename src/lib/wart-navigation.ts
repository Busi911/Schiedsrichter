// Die Wart-Seiten liegen unter /profil (dort arbeiten auch Warte ohne Admin-Rechte); Admins kamen bisher nur über
// "Mein Profil" hin. Im Admin-Menü (Desktop-Dropdown in admin-nav.tsx, "Mehr" auf dem Handy in admin/(dashboard)/layout.tsx)
// nur für volle Admins: "nur lesend" darf die Wart-Seiten nicht öffnen.
export type WartItem = { href: string; label: string };

export const WART_ITEMS: WartItem[] = [
  { href: "/profil/schiedsrichterwart", label: "Schiedsrichterwart" },
  { href: "/profil/zeitnehmerwart", label: "Zeitnehmer-/Sekretärwart" },
  { href: "/profil/ordnerwart", label: "Ordnerwart" },
];

// Eigene Dienste (Fahrer, Kuchen, ...): nur zeigen, wenn der Verein welche angelegt hat (lib/eigene-dienste.ts).
export const DIENSTWART_ITEM: WartItem = { href: "/profil/dienstwart", label: "Dienstwart (eigene Dienste)" };

export function wartItems(mitEigenenDiensten: boolean): WartItem[] {
  return mitEigenenDiensten ? [...WART_ITEMS, DIENSTWART_ITEM] : WART_ITEMS;
}
