// Erklärung für eine leere öffentliche Eintragungsseite (/eintragen/[token]), rein/getestet. „Keine anstehenden Termine“ allein ließ offen, ob nichts
// ansteht, kein Bedarf eingerichtet ist oder alles besetzt wäre (Testbericht 09.11.2026).

export type LeerErklaerung = {
  /** Kurzer, für alle verständlicher Satz (auch für nicht angemeldete Besucher). */
  text: string;
  /** Zusatz nur für Verantwortliche (Admins): warum, und wo man es ändert. */
  fuerAdmin?: { text: string; href: string; linkText: string };
};

export function leerErklaerung(opt: {
  /** Künftige Termine der angebotenen Arten insgesamt (auch solche ohne Dienstbedarf). */
  anstehende: number;
  /** Davon mit Dienstbedarf, also eintragbar oder schon besetzt (ungefiltert). */
  mitBedarf: number;
  /** Es ist ein Mannschaftsfilter gesetzt. */
  gefiltert: boolean;
}): LeerErklaerung {
  if (opt.gefiltert && opt.mitBedarf > 0) {
    return { text: "Für diese Mannschaft sind aktuell keine Dienste zur Eintragung freigegeben. Wähle oben „Alle“ oder eine andere Mannschaft." };
  }
  if (opt.anstehende === 0) {
    return {
      text: "Aktuell sind keine Dienste zur Eintragung freigegeben: Es stehen keine anstehenden Spiele oder Termine an.",
      fuerAdmin: { text: "Es sind keine künftigen Spiele oder Termine vorhanden (Spielplan anbinden oder Termine anlegen).", href: "/admin/termine", linkText: "Zu den Terminen" },
    };
  }
  return {
    text: "Aktuell sind keine Dienste zur Eintragung freigegeben.",
    fuerAdmin: {
      text: `Für die ${opt.anstehende} anstehenden ${opt.anstehende === 1 ? "Termin" : "Termine"} ist kein Dienstbedarf eingerichtet (Bedarf 0), deshalb gibt es nichts einzutragen.`,
      href: "/admin/einstellungen#dienste-bedarf",
      linkText: "Dienstbedarf einrichten",
    },
  };
}
