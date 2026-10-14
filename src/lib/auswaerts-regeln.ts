// Rein (ohne DB), getestet in auswaerts-regeln.test.ts: was mit einem schon angelegten Auswärtsspiel-Termin passiert, wenn sich das
// Spiel in den Liga-Daten ändert. Ablauf in lib/auswaerts-termine.ts.

const MINUTE_MS = 60_000;

export type AuswaertsSpiel = {
  status: "geplant" | "verlegt" | "abgesagt" | "nicht_angetreten" | "gespielt";
  // Anwurf als Zeitpunkt, falls bekannt; sonst aus Datum + Uhrzeit (deutsche Zeit) errechnet vom Aufrufer.
  start: Date | null;
  halleName: string | null;
  toreHeim: number | null;
  toreGast: number | null;
};

export type AuswaertsTermin = {
  start: Date;
  ort: string | null;
  ergebnisHeim: number | null;
  ergebnisAuswaerts: number | null;
};

export type AuswaertsEntscheidung = {
  // "verlegen": neue Zeit (Einteilungen eigener Dienste entfallen, Betroffene werden informiert, wie bei Heimspielen).
  // "absagen": Spiel abgesagt oder aus den Liga-Daten verschwunden -> Termin entfällt (Betroffene werden informiert).
  // "ort": nur die Halle hat sich geändert (für Fahrer wichtig, Einteilungen bleiben).
  aktion: "keine" | "verlegen" | "absagen" | "ort";
  start?: Date;
  ort?: string | null;
  // Endergebnis übernehmen (still), unabhängig von der Aktion.
  ergebnis?: { heim: number; gast: number };
};

function hallenNameAndersAls(neu: string | null, alt: string | null): boolean {
  if (!neu) return false;
  return neu.trim().toLowerCase() !== (alt ?? "").trim().toLowerCase();
}

// spiel = null: das Spiel steht nicht mehr in den Liga-Daten (z.B. Staffel neu angelegt).
export function entscheideAuswaerts(termin: AuswaertsTermin, spiel: AuswaertsSpiel | null, jetzt: Date): AuswaertsEntscheidung {
  const ergebnis =
    spiel && spiel.toreHeim !== null && spiel.toreGast !== null && (spiel.toreHeim !== termin.ergebnisHeim || spiel.toreGast !== termin.ergebnisAuswaerts)
      ? { heim: spiel.toreHeim, gast: spiel.toreGast }
      : undefined;
  // Begonnene oder vergangene Termine werden nicht mehr verlegt oder abgesagt (wie bei Heimspielen), nur das Ergebnis kommt dazu.
  if (termin.start.getTime() < jetzt.getTime()) return { aktion: "keine", ergebnis };
  if (!spiel || spiel.status === "abgesagt") return { aktion: "absagen" };
  if (
    spiel.start &&
    !Number.isNaN(spiel.start.getTime()) &&
    (spiel.status === "geplant" || spiel.status === "verlegt") &&
    Math.abs(spiel.start.getTime() - termin.start.getTime()) >= MINUTE_MS
  ) {
    return { aktion: "verlegen", start: spiel.start, ort: spiel.halleName ?? termin.ort, ergebnis };
  }
  if (hallenNameAndersAls(spiel.halleName, termin.ort)) return { aktion: "ort", ort: spiel.halleName, ergebnis };
  return { aktion: "keine", ergebnis };
}
