// Reine Rechnung für Trainingsausfälle (ohne DB, getestet in training-ausfall.test.ts): aus dem Wochenplan (trainingszeit, gilt jede Woche) werden
// konkrete Trainings mit Datum, abzüglich der gemeldeten Ausfälle (training_ausfall). Datum immer als Kalendertag "YYYY-MM-DD" in deutscher Zeit.

export type TrainingsZeile = {
  id: string;
  mannschaftId: string;
  halleId: string;
  wochentag: number; // 0 = Montag … 6 = Sonntag
  startMinuten: number;
  endMinuten: number;
  abteilNummer: number | null;
  farbe: string;
};

export type AusfallZeile = { trainingszeitId: string; datum: string; grund: string | null };

export type KonkretesTraining = TrainingsZeile & { datum: string; ausgefallen: boolean; grund: string | null };

// Gilt der Ort der Trainingszeit an diesem Tag (Saison, z.B. Beachplatz Mai bis September)? Ohne Angabe gilt jeder Ort immer.
export type SaisonPruefung = (halleId: string, datum: string) => boolean;

const TAG_MS = 24 * 60 * 60 * 1000;

function utcAusDatum(datum: string): Date {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t));
}

export function istGueltigesDatum(datum: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return false;
  return utcAusDatum(datum).toISOString().slice(0, 10) === datum;
}

// 0 = Montag … 6 = Sonntag (wie trainingszeit.wochentag).
export function wochentagVonDatum(datum: string): number {
  return (utcAusDatum(datum).getUTCDay() + 6) % 7;
}

export function addiereTage(datum: string, tage: number): string {
  return new Date(utcAusDatum(datum).getTime() + tage * TAG_MS).toISOString().slice(0, 10);
}

// Heutiger Kalendertag und Uhrzeit (Minuten seit Mitternacht) in deutscher Zeit.
export function berlinJetzt(jetzt: Date): { datum: string; minuten: number } {
  const teile = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(jetzt);
  const w = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "00";
  return { datum: `${w("year")}-${w("month")}-${w("day")}`, minuten: Number(w("hour")) * 60 + Number(w("minute")) };
}

// Konkrete Trainings der nächsten `tage` Tage ab `abDatum` (einschließlich), nach Datum und Beginn sortiert. Ein Training, das heute schon
// zu Ende ist (endMinuten <= jetzt), fällt weg; sonst zählt es.
export function konkreteTrainings(
  zeiten: TrainingsZeile[],
  ausfaelle: AusfallZeile[],
  jetzt: Date,
  tage: number,
  inSaison?: SaisonPruefung
): KonkretesTraining[] {
  const { datum: heute, minuten } = berlinJetzt(jetzt);
  const ausfall = new Map(ausfaelle.map((a) => [`${a.trainingszeitId}|${a.datum}`, a]));
  const liste: KonkretesTraining[] = [];
  for (let i = 0; i < tage; i++) {
    const datum = addiereTage(heute, i);
    const wochentag = wochentagVonDatum(datum);
    for (const z of zeiten) {
      if (z.wochentag !== wochentag) continue;
      if (inSaison && !inSaison(z.halleId, datum)) continue;
      if (i === 0 && z.endMinuten <= minuten) continue;
      const a = ausfall.get(`${z.id}|${datum}`);
      liste.push({ ...z, datum, ausgefallen: !!a, grund: a?.grund ?? null });
    }
  }
  return liste.sort((x, y) => x.datum.localeCompare(y.datum) || x.startMinuten - y.startMinuten);
}

// Prüft eine Meldung: Datum gültig, passt zum Wochentag der Trainingszeit und das Training ist noch nicht vorbei. Gibt eine Fehlermeldung oder null zurück.
export function pruefeAusfallDatum(zeit: Pick<TrainingsZeile, "wochentag" | "endMinuten">, datum: string, jetzt: Date, inSaison = true): string | null {
  if (!istGueltigesDatum(datum)) return "Ungültiges Datum.";
  if (wochentagVonDatum(datum) !== zeit.wochentag) return "An diesem Tag findet das Training nicht statt.";
  if (!inSaison) return "An diesem Tag ist der Ort nicht in Betrieb (außerhalb der Saison).";
  const heute = berlinJetzt(jetzt);
  if (datum < heute.datum || (datum === heute.datum && zeit.endMinuten <= heute.minuten)) return "Dieses Training ist schon vorbei.";
  return null;
}

// Wer den Extra-Punkt "Training" sieht: Admins (auch lesend) und Trainer immer, alle anderen nur, wenn der Verein ihn freigeschaltet hat.
export function darfTrainingSehen(p: { istAdmin: boolean; istAdminLesend: boolean; istTrainer: boolean; fuerAlleSichtbar: boolean }): boolean {
  return p.istAdmin || p.istAdminLesend || p.istTrainer || p.fuerAlleSichtbar;
}

// Wer einen Ausfall melden/zurücknehmen darf: Admins (Schreibzugriff) und Trainer DIESER Mannschaft.
export function darfAusfallMelden(p: { istAdmin: boolean; trainerMannschaftIds: string[]; mannschaftId: string }): boolean {
  return p.istAdmin || p.trainerMannschaftIds.includes(p.mannschaftId);
}

// "Donnerstag, 22.10." (Datum ist ein Kalendertag, keine Zeitzone nötig).
export function formatTrainingDatum(datum: string, lang = true): string {
  const d = new Date(`${datum}T12:00:00Z`);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: lang ? "long" : "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export function formatMinuten(minuten: number): string {
  return `${String(Math.floor(minuten / 60)).padStart(2, "0")}:${String(minuten % 60).padStart(2, "0")}`;
}

// Konkrete Trainings in einem Zeitraum (Kalendertage YYYY-MM-DD, beide inklusive) — für den Kalender, auch für vergangene Tage. Wie konkreteTrainings,
// aber ohne "heute schon beendet fällt weg".
export function trainingsImZeitraum(zeiten: TrainingsZeile[], ausfaelle: AusfallZeile[], vonDatum: string, bisDatum: string, inSaison?: SaisonPruefung): KonkretesTraining[] {
  const ausfall = new Map(ausfaelle.map((a) => [`${a.trainingszeitId}|${a.datum}`, a]));
  const liste: KonkretesTraining[] = [];
  for (let datum = vonDatum, n = 0; datum <= bisDatum && n < 400; datum = addiereTage(datum, 1), n++) {
    const wochentag = wochentagVonDatum(datum);
    for (const z of zeiten) {
      if (z.wochentag !== wochentag) continue;
      if (inSaison && !inSaison(z.halleId, datum)) continue;
      const a = ausfall.get(`${z.id}|${datum}`);
      liste.push({ ...z, datum, ausgefallen: !!a, grund: a?.grund ?? null });
    }
  }
  return liste.sort((x, y) => x.datum.localeCompare(y.datum) || x.startMinuten - y.startMinuten);
}
