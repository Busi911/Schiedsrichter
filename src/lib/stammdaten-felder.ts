// Stammdaten, die nach dem Einrichten gesperrt werden, sobald Funktionsträger eingetragen sind (rein, ohne DB).
// Ändert sich so ein Wert, könnten Termine, Ansetzungen und eingetragene Dienste verloren gehen — deshalb geht
// eine Änderung dann nur als Antrag mit Grund an den Systemadmin (Tabelle stammdaten_aenderung).
export const STAMMDATEN_FELDER = {
  nuligaClubId: "nuLiga-Vereins-ID",
  handballNetClubId: "handball.net-Vereins-ID",
  handballNetTeamIds: "handball.net-Team-IDs",
  nuligaHalle1Id: "Hallen-ID Halle 1",
  nuligaHalle2Id: "Hallen-ID Halle 2",
  nuligaHalle3Id: "Hallen-ID Halle 3",
  eigeneHallenNamen: "Namen der Spielhallen",
  zusatzquellen: "Weitere Vereine (Spielgemeinschaft)",
  sonstiges: "Sonstiges (z.B. öffentliche Seite entfernen)",
} as const;

export type StammdatenFeld = keyof typeof STAMMDATEN_FELDER;

// Felder, die der Systemadmin beim Genehmigen automatisch setzen lassen kann; der Rest wird von Hand erledigt.
export const AUTOMATISCH_ANWENDBAR: StammdatenFeld[] = [
  "nuligaClubId",
  "handballNetClubId",
  "handballNetTeamIds",
  "nuligaHalle1Id",
  "nuligaHalle2Id",
  "nuligaHalle3Id",
  "eigeneHallenNamen",
];

export const istStammdatenFeld = (f: string): f is StammdatenFeld => f in STAMMDATEN_FELDER;

// Für den Vergleich: Leerraum und Groß-/Kleinschreibung bei Namen ignorieren, Zeilenreihenfolge bleibt.
export function normalisiereWert(feld: StammdatenFeld, wert: string | null | undefined): string {
  const roh = (wert ?? "").trim();
  if (feld === "eigeneHallenNamen") {
    return roh
      .split(/\r?\n/)
      .map((z) => z.trim().toLowerCase())
      .filter(Boolean)
      .join("\n");
  }
  if (feld === "handballNetTeamIds") return roh.split(/[\s,;]+/).filter(Boolean).join(",");
  return roh;
}

// Fehlertext oder null. Gleiche Regeln wie beim normalen Speichern.
export function pruefeStammdatenWert(feld: StammdatenFeld, wert: string): string | null {
  const w = wert.trim();
  switch (feld) {
    case "nuligaClubId":
      return w && !/^\d{1,10}$/.test(w) ? "Die nuLiga-Vereins-ID besteht nur aus Ziffern (z.B. 69723)." : null;
    case "handballNetClubId":
      return w && !/^[a-z0-9]{3,20}$/i.test(w) ? "Die handball.net-Vereins-ID besteht aus Buchstaben/Ziffern (z.B. 0b8y490)." : null;
    case "handballNetTeamIds":
      return w && !/^\d+([\s,;]+\d+)*$/.test(w) ? "Team-IDs bitte als Zahlen, durch Komma getrennt." : null;
    case "nuligaHalle1Id":
    case "nuligaHalle2Id":
    case "nuligaHalle3Id":
      return w && !/^\d+$/.test(w) ? "Hallen-IDs bestehen nur aus Ziffern." : null;
    case "eigeneHallenNamen":
      return w.length > 500 ? "Höchstens 500 Zeichen." : null;
    default:
      return w.length > 500 ? "Höchstens 500 Zeichen." : null;
  }
}

// Welche der übergebenen Felder würden einen vorhandenen Wert ändern? Ein leeres Feld zu füllen ist immer erlaubt
// (dabei geht nichts verloren), nur das Ändern/Leeren eines gesetzten Werts zählt.
export function geaenderteStammdaten(
  alt: Partial<Record<StammdatenFeld, string | null | undefined>>,
  neu: Partial<Record<StammdatenFeld, string | null | undefined>>
): StammdatenFeld[] {
  const geaendert: StammdatenFeld[] = [];
  for (const feld of Object.keys(neu) as StammdatenFeld[]) {
    const vorher = normalisiereWert(feld, alt[feld]);
    if (!vorher) continue;
    if (normalisiereWert(feld, neu[feld]) !== vorher) geaendert.push(feld);
  }
  return geaendert;
}
