// Eigene Funktion statt new Date() direkt im Seiten-Component, das sonst
// gegen die react-hooks/purity-Regel verstößt (impure Funktion während
// des Renderns, siehe gleiche Lösung bei istAbgelaufen in
// profil/email-bestaetigen/[token]/page.tsx).
export function jetzt(): Date {
  return new Date();
}

const MONATS_NAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monatsSchluessel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type MonatsGruppe<T> = {
  schluessel: string;
  label: string;
  items: T[];
  offenAnzahl: number;
  // Aktueller + nächster Monat stehen offen, alles andere eingeklappt —
  // die weit überwiegende Mehrzahl der Klicks betrifft die nahe Zukunft,
  // weiter entfernte Monate bleiben trotzdem einen Klick entfernt statt
  // komplett zu verschwinden (siehe "Nur offene anzeigen"-Filter, der
  // unabhängig davon weiterhin funktioniert).
  standardOffen: boolean;
};

// Gruppiert eine bereits nach Startzeit sortierte Liste nach Kalendermonat
// — verhindert, dass eine ganze Saison an Terminen (Rundenspiele laufen oft
// viele Monate im Voraus) als eine einzige, unbegrenzt lange Liste
// dargestellt wird (siehe gleiches Prinzip bei /admin/termine, dort als
// Anstehend/Vergangen-Reiter statt Monatsgruppen, weil dort auch
// vergangene Termine geladen werden — hier laden alle drei Wart-Seiten
// grundsätzlich nur zukünftige Termine, siehe holeTermineMitZuordnungen/
// holeOrdnerRelevanteTermine).
export function gruppiereNachMonat<T>(
  items: T[],
  start: (item: T) => Date,
  istOffen: (item: T) => boolean,
  jetzt: Date
): MonatsGruppe<T>[] {
  const aktuellerSchluessel = monatsSchluessel(jetzt);
  const naechsterMonat = new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 1);
  const naechsterSchluessel = monatsSchluessel(naechsterMonat);

  const nachSchluessel = new Map<string, T[]>();
  for (const item of items) {
    const schluessel = monatsSchluessel(start(item));
    const liste = nachSchluessel.get(schluessel) ?? [];
    liste.push(item);
    nachSchluessel.set(schluessel, liste);
  }

  return [...nachSchluessel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schluessel, gruppenItems]) => {
      const [jahr, monat] = schluessel.split("-").map(Number);
      return {
        schluessel,
        label: `${MONATS_NAMEN[monat - 1]} ${jahr}`,
        items: gruppenItems,
        offenAnzahl: gruppenItems.filter(istOffen).length,
        standardOffen:
          schluessel === aktuellerSchluessel || schluessel === naechsterSchluessel,
      };
    });
}
