// Die Wart-Seiten liegen unter /profil (dort arbeiten auch Warte ohne Admin-Rechte); Admins kamen bisher nur über
// "Mein Profil" hin. Im Admin-Menü (Desktop-Dropdown in admin-nav.tsx, "Mehr" auf dem Handy in admin/(dashboard)/layout.tsx)
// nur für volle Admins: "nur lesend" darf die Wart-Seiten nicht öffnen.
export const WART_ITEMS = [
  { href: "/profil/schiedsrichterwart", label: "Schiedsrichterwart" },
  { href: "/profil/zeitnehmerwart", label: "Zeitnehmer-/Sekretärwart" },
  { href: "/profil/ordnerwart", label: "Ordnerwart" },
];
