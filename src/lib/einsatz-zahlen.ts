// Reine Merge-/Summier-Logik (ohne DB-Zugriff), geteilt zwischen
// ordnerwart.ts, zeitnehmerwart.ts und schiedsrichterwart.ts — jede der drei
// Wart-Übersichten zählt bereits absolvierte Einsätze pro Person, muss dabei
// aber mehrere Rollen bzw. mehrere Zähl-Quellen (Rollen-Zeilen je einmal pro
// Rolle, Einsatz-Zählung separat) zu EINEM Eintrag pro Person zusammenführen
// — sonst taucht eine Person mit mehreren Rollen mehrfach auf. Siehe
// einsatz-zahlen.test.ts.

// userId nullable: eine Zählung kann eine Gruppe für "keine Zuordnung"
// enthalten (z.B. termin_zuordnung.userId bei "ohne Login"-Personen, oder
// termine.ics_schiedsrichter_id bei einem noch nicht zugeordneten ICS-Spiel)
// — die matcht dann einfach keine echte Person.
export type Zaehlung = { userId: string | null; anzahl: number | string };

type PersonMitRolle<R extends string> = {
  userId: string;
  name: string | null;
  email: string;
  typ: R;
};

export type EinsatzZahlMitRollen<R extends string> = {
  userId: string;
  name: string | null;
  email: string;
  anzahlEinsaetze: number;
  rollen: R[];
};

// Fasst mehrere Rollen-Zeilen derselben Person (z.B. Ordner+Kioskdienst,
// Zeitnehmer+Sekretär) zu einem Eintrag zusammen, mit der Summe ihrer
// Einsätze über alle Rollen (zuordnungZaehlung zählt bereits rollenübergreifend).
export function mergeRollenZaehlungen<R extends string>(
  rollenZeilen: PersonMitRolle<R>[],
  zuordnungZaehlung: Zaehlung[]
): EinsatzZahlMitRollen<R>[] {
  const personenMap = new Map<string, EinsatzZahlMitRollen<R>>();
  for (const r of rollenZeilen) {
    const eintrag = personenMap.get(r.userId) ?? {
      userId: r.userId,
      name: r.name,
      email: r.email,
      anzahlEinsaetze: Number(
        zuordnungZaehlung.find((z) => z.userId === r.userId)?.anzahl ?? 0
      ),
      rollen: [] as R[],
    };
    eintrag.rollen.push(r.typ);
    personenMap.set(r.userId, eintrag);
  }
  return Array.from(personenMap.values());
}

type Person = { userId: string; name: string | null; email: string };

// Summiert zwei unabhängige Zähl-Quellen pro Person (z.B. ICS-Feed-Einsätze
// UND über termin_zuordnung erfasste Einsätze) zu einer Gesamtzahl.
export function summiereZweiZaehlungen<T extends Person>(
  basisListe: T[],
  zaehlungA: Zaehlung[],
  zaehlungB: Zaehlung[]
): (T & { anzahlEinsaetze: number })[] {
  return basisListe.map((person) => {
    const a = zaehlungA.find((z) => z.userId === person.userId)?.anzahl ?? 0;
    const b = zaehlungB.find((z) => z.userId === person.userId)?.anzahl ?? 0;
    return { ...person, anzahlEinsaetze: Number(a) + Number(b) };
  });
}
