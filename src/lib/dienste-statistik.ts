import "server-only";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
} from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users } from "@/db/schema";
import { normalisiereMannschaftsname } from "@/lib/rundenspiel-import";

// Statistik-Sektion auf /admin/dienste — "wie ausgelastet sind wir" (Top
// Dienstleistende) und "wie laufen unsere Mannschaften" (Bilanz), als Ergänzung
// zur reinen "unbesetzte Dienste"-Liste oben auf der Seite.

export type RundenspielErgebnisZeile = {
  mannschaftId: string;
  mannschaftName: string | null;
  mannschaftAltersklasse: string | null;
  heimMannschaftName: string | null;
  auswaertsMannschaftName: string | null;
  ergebnisHeim: number;
  ergebnisAuswaerts: number;
};

export type MannschaftsBilanz = {
  mannschaftId: string;
  label: string;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  spiele: number;
};

// Auf welcher Seite (heim/auswärts) stand die EIGENE Mannschaft in diesem
// Rundenspiel-Rohdatensatz? Gleiche Best-Effort-Logik wie findeMannschaft in
// rundenspiel-import.ts (exakter Name-Match ODER die Mannschaft als Wortteil
// im Roh-Namen enthalten) — matcht beides oder nichts, ist das Ergebnis nicht
// eindeutig zuordenbar und das Spiel fließt nicht in die Bilanz ein.
function bestimmeSeite(
  heimNorm: string | null,
  auswaertsNorm: string | null,
  eigenerNameNorm: string
): "heim" | "auswaerts" | null {
  const heimPasst =
    heimNorm !== null &&
    (heimNorm === eigenerNameNorm || heimNorm.includes(eigenerNameNorm));
  const auswaertsPasst =
    auswaertsNorm !== null &&
    (auswaertsNorm === eigenerNameNorm || auswaertsNorm.includes(eigenerNameNorm));
  if (heimPasst && !auswaertsPasst) return "heim";
  if (auswaertsPasst && !heimPasst) return "auswaerts";
  return null;
}

// Reine Berechnung (ohne DB-Zugriff), damit sie ohne Testdatenbank getestet
// werden kann — siehe dienste-statistik.test.ts.
export function berechneMannschaftsBilanzen(
  ergebnisse: RundenspielErgebnisZeile[]
): MannschaftsBilanz[] {
  const bilanzen = new Map<string, MannschaftsBilanz>();

  for (const e of ergebnisse) {
    if (!e.mannschaftName) continue;
    const eigenerNameNorm = normalisiereMannschaftsname(e.mannschaftName);
    const heimNorm = e.heimMannschaftName
      ? normalisiereMannschaftsname(e.heimMannschaftName)
      : null;
    const auswaertsNorm = e.auswaertsMannschaftName
      ? normalisiereMannschaftsname(e.auswaertsMannschaftName)
      : null;
    const seite = bestimmeSeite(heimNorm, auswaertsNorm, eigenerNameNorm);
    if (!seite) continue;

    const eigeneTore = seite === "heim" ? e.ergebnisHeim : e.ergebnisAuswaerts;
    const gegnerTore = seite === "heim" ? e.ergebnisAuswaerts : e.ergebnisHeim;

    const bilanz = bilanzen.get(e.mannschaftId) ?? {
      mannschaftId: e.mannschaftId,
      label: e.mannschaftAltersklasse
        ? `${e.mannschaftName} (${e.mannschaftAltersklasse})`
        : e.mannschaftName,
      siege: 0,
      unentschieden: 0,
      niederlagen: 0,
      spiele: 0,
    };
    bilanz.spiele += 1;
    if (eigeneTore > gegnerTore) bilanz.siege += 1;
    else if (eigeneTore < gegnerTore) bilanz.niederlagen += 1;
    else bilanz.unentschieden += 1;
    bilanzen.set(e.mannschaftId, bilanz);
  }

  // Sortiert nach Tordifferenz-Vorzeichen der Siege/Niederlagen, bei
  // Gleichstand nach Anzahl Spiele — eine Mannschaft mit 1 Sieg aus 1 Spiel
  // soll nicht vor einer mit 10 Siegen aus 12 Spielen stehen.
  return [...bilanzen.values()].sort(
    (a, b) => b.siege - b.niederlagen - (a.siege - a.niederlagen) || b.spiele - a.spiele
  );
}

export type Gesamtbilanz = {
  spiele: number;
  siegquote: number | null;
};

// Über alle Mannschaften aggregiert — für die KPI-Kacheln auf /admin und
// /admin/dienste, die nicht pro Mannschaft aufschlüsseln, sondern nur "wie
// laufen wir insgesamt" zeigen wollen.
export function berechneGesamtbilanz(bilanzen: MannschaftsBilanz[]): Gesamtbilanz {
  const spiele = bilanzen.reduce((sum, b) => sum + b.spiele, 0);
  const siege = bilanzen.reduce((sum, b) => sum + b.siege, 0);
  return {
    spiele,
    siegquote: spiele > 0 ? Math.round((siege / spiele) * 100) : null,
  };
}

export async function holeMannschaftsBilanzen(
  vereinId: string
): Promise<MannschaftsBilanz[]> {
  const ergebnisse = await withTenant(vereinId, (tx) =>
    tx
      .select({
        mannschaftId: termine.mannschaftId,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        heimMannschaftName: termine.heimMannschaftName,
        auswaertsMannschaftName: termine.auswaertsMannschaftName,
        ergebnisHeim: termine.ergebnisHeim,
        ergebnisAuswaerts: termine.ergebnisAuswaerts,
      })
      .from(termine)
      .innerJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          eq(termine.typ, "rundenspiel"),
          isNotNull(termine.ergebnisHeim),
          isNotNull(termine.ergebnisAuswaerts)
        )
      )
  );

  return berechneMannschaftsBilanzen(
    ergebnisse.map((e) => ({
      ...e,
      mannschaftId: e.mannschaftId!,
      ergebnisHeim: e.ergebnisHeim!,
      ergebnisAuswaerts: e.ergebnisAuswaerts!,
    }))
  );
}

export type DienstEinsatzZahl = {
  userId: string;
  name: string | null;
  email: string;
  anzahlEinsaetze: number;
};

const DIENST_RELEVANTE_ROLLEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "ordner",
  "kioskdienst",
] as const;

// Über ALLE Funktionsträger-Rollen hinweg (Schiedsrichter, Zeitnehmer,
// Sekretär, Ordner, Kioskdienst) — anders als die rollenspezifischen
// Einsatzzahlen der Wart-Seiten (z.B. holeZeitnehmerEinsatzZahlen), die
// jeweils nur ihre eigene Rolle zählen. Nur vergangene Termine, damit eine
// bereits erfolgte, aber noch nicht absolvierte Zuordnung nicht mitzählt.
export async function holeTopDienstmenschen(
  vereinId: string,
  limit = 8
): Promise<DienstEinsatzZahl[]> {
  return withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .select({
        userId: terminZuordnungen.userId,
        name: users.name,
        email: users.email,
        anzahlEinsaetze: count(),
      })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .innerJoin(users, eq(terminZuordnungen.userId, users.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          lt(termine.start, new Date()),
          inArray(terminZuordnungen.funktionstraegerTyp, DIENST_RELEVANTE_ROLLEN)
        )
      )
      .groupBy(terminZuordnungen.userId, users.name, users.email)
      .orderBy(desc(count()))
      .limit(limit);

    return zeilen.map((z) => ({
      userId: z.userId!,
      name: z.name,
      email: z.email,
      anzahlEinsaetze: Number(z.anzahlEinsaetze),
    }));
  });
}

// Anzahl VERSCHIEDENER Personen mit mindestens einem absolvierten Dienst —
// getrennt von holeTopDienstmenschen (das nur die Top-N zurückgibt), da für
// die KPI-Kachel die tatsächliche Gesamtzahl gebraucht wird, nicht nur die
// Länge der (ggf. gekappten) Bestenliste.
export async function holeAnzahlAktiverDienstleistender(
  vereinId: string
): Promise<number> {
  return withTenant(vereinId, async (tx) => {
    const [zeile] = await tx
      .select({ anzahl: countDistinct(terminZuordnungen.userId) })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          lt(termine.start, new Date()),
          isNotNull(terminZuordnungen.userId),
          inArray(terminZuordnungen.funktionstraegerTyp, DIENST_RELEVANTE_ROLLEN)
        )
      );
    return Number(zeile?.anzahl ?? 0);
  });
}

