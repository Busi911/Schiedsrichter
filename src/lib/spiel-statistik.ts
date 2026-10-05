import { istZwischenstand } from "./liga-spiel-status";
import type { MannschaftsBilanz } from "./dienste-statistik-typen";
import type { SpielAnsicht } from "./liga-spiele-hilfen";

// Bilanz (Sieg/Unentschieden/Niederlage) je Mannschaft aus ALLEN Spielen der öffentlichen Liga-Daten, also Heim- UND
// Auswärtsspiele sowie Freundschaftsspiele — anders als die frühere Statistik, die nur Heimspiele aus dem
// Hallenplan-Import kannte. Rein (ohne DB), damit ohne Testdatenbank testbar.
// Nicht gezählt: Spiele ohne Ergebnis, Zwischenstände laufender Spiele (nicht genehmigt, Anwurf < 3 h her) und
// Nichtantritte (kein spielerisches Ergebnis).
export type StatistikMannschaft = {
  id: string;
  name: string;
  altersklasse: string | null;
  teamtableId: string | null;
  spiele: SpielAnsicht[];
};

export function berechneBilanzAusLigaSpielen(
  mannschaften: StatistikMannschaft[],
  jetzt: Date
): MannschaftsBilanz[] {
  const bilanzen: MannschaftsBilanz[] = [];
  for (const m of mannschaften) {
    if (!m.teamtableId) continue;
    const bilanz: MannschaftsBilanz = {
      mannschaftId: m.id,
      label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
      siege: 0,
      unentschieden: 0,
      niederlagen: 0,
      spiele: 0,
    };
    for (const s of m.spiele) {
      if (s.toreHeim === null || s.toreGast === null) continue;
      if (s.status === "nicht_angetreten" || istZwischenstand(s, jetzt)) continue;
      const heim = s.heimTeamtableId === m.teamtableId;
      if (!heim && s.gastTeamtableId !== m.teamtableId) continue;
      const eigen = heim ? s.toreHeim : s.toreGast;
      const gegner = heim ? s.toreGast : s.toreHeim;
      bilanz.spiele++;
      if (eigen > gegner) bilanz.siege++;
      else if (eigen < gegner) bilanz.niederlagen++;
      else bilanz.unentschieden++;
    }
    if (bilanz.spiele > 0) bilanzen.push(bilanz);
  }
  // Wie bisher: nach (Siege − Niederlagen), bei Gleichstand nach Anzahl Spiele.
  return bilanzen.sort(
    (a, b) => b.siege - b.niederlagen - (a.siege - a.niederlagen) || b.spiele - a.spiele
  );
}

// ---- Kennzahlen je Mannschaft für den Statistik-Reiter der öffentlichen App ----

export type SpielHighlight = { eigen: number; gegner: number; gegnerName: string; datum: string; heim: boolean };

export type MannschaftsKennzahlen = {
  mannschaftId: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  siegquote: number | null; // Prozent
  torePlus: number;
  toreMinus: number;
  schnittPlus: number | null; // Tore pro Spiel
  schnittMinus: number | null;
  heim: { spiele: number; siege: number; unentschieden: number; niederlagen: number };
  auswaerts: { spiele: number; siege: number; unentschieden: number; niederlagen: number };
  form: ("S" | "U" | "N")[]; // letzte 5, älteste zuerst
  hoechsterSieg: SpielHighlight | null;
  torreichstes: (SpielHighlight & { summe: number }) | null;
  // Nur Spiele mit bekanntem Halbzeitstand (nuLiga); null, wenn keines vorhanden.
  halbzeit: { spiele: number; fuehrungZurPause: number; siegNachFuehrung: number; gedreht: number } | null;
  // Saisonverlauf: Punkte (Sieg 2, Unentschieden 1) und Tordifferenz summiert nach jedem gespielten Spiel (chronologisch).
  verlauf: { punkte: number; diff: number }[];
  // Duelle je Gegner (Hin-/Rückspiel), auch noch ausstehende; Ergebnis null = noch nicht gespielt/gewertet.
  duelle: Duell[];
};

export type DuellSpiel = { datum: string; heim: boolean; eigen: number | null; gegner: number | null };
export type Duell = { gegnerName: string; spiele: DuellSpiel[] };

const rund1 = (n: number) => Math.round(n * 10) / 10;

export function berechneMannschaftsKennzahlen(m: StatistikMannschaft, jetzt: Date): MannschaftsKennzahlen | null {
  if (!m.teamtableId) return null;
  const k: MannschaftsKennzahlen = {
    mannschaftId: m.id,
    spiele: 0,
    siege: 0,
    unentschieden: 0,
    niederlagen: 0,
    siegquote: null,
    torePlus: 0,
    toreMinus: 0,
    schnittPlus: null,
    schnittMinus: null,
    heim: { spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0 },
    auswaerts: { spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0 },
    form: [],
    hoechsterSieg: null,
    torreichstes: null,
    halbzeit: null,
    verlauf: [],
    duelle: [],
  };
  const chronologisch = [...m.spiele].sort(
    (a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit ?? "").localeCompare(b.uhrzeit ?? "")
  );
  for (const s of chronologisch) {
    if (s.toreHeim === null || s.toreGast === null) continue;
    if (s.status === "nicht_angetreten" || istZwischenstand(s, jetzt)) continue;
    const heim = s.heimTeamtableId === m.teamtableId;
    if (!heim && s.gastTeamtableId !== m.teamtableId) continue;
    const eigen = heim ? s.toreHeim : s.toreGast;
    const gegner = heim ? s.toreGast : s.toreHeim;
    const ausgang: "S" | "U" | "N" = eigen > gegner ? "S" : eigen === gegner ? "U" : "N";
    const seite = heim ? k.heim : k.auswaerts;
    k.spiele++;
    seite.spiele++;
    k.torePlus += eigen;
    k.toreMinus += gegner;
    if (ausgang === "S") {
      k.siege++;
      seite.siege++;
    } else if (ausgang === "U") {
      k.unentschieden++;
      seite.unentschieden++;
    } else {
      k.niederlagen++;
      seite.niederlagen++;
    }
    k.form.push(ausgang);
    const vorher = k.verlauf.at(-1) ?? { punkte: 0, diff: 0 };
    k.verlauf.push({
      punkte: vorher.punkte + (ausgang === "S" ? 2 : ausgang === "U" ? 1 : 0),
      diff: vorher.diff + eigen - gegner,
    });
    const gegnerName = heim ? s.gastName : s.heimName;
    const basis = { eigen, gegner, gegnerName, datum: s.datum, heim };
    if (ausgang === "S" && (!k.hoechsterSieg || eigen - gegner > k.hoechsterSieg.eigen - k.hoechsterSieg.gegner)) {
      k.hoechsterSieg = basis;
    }
    if (!k.torreichstes || eigen + gegner > k.torreichstes.summe) k.torreichstes = { ...basis, summe: eigen + gegner };
    if (s.halbzeitHeim !== null && s.halbzeitGast !== null) {
      const hz = k.halbzeit ?? { spiele: 0, fuehrungZurPause: 0, siegNachFuehrung: 0, gedreht: 0 };
      const eigenHz = heim ? s.halbzeitHeim : s.halbzeitGast;
      const gegnerHz = heim ? s.halbzeitGast : s.halbzeitHeim;
      hz.spiele++;
      if (eigenHz > gegnerHz) {
        hz.fuehrungZurPause++;
        if (ausgang === "S") hz.siegNachFuehrung++;
      } else if (eigenHz < gegnerHz && ausgang === "S") {
        hz.gedreht++;
      }
      k.halbzeit = hz;
    }
  }
  if (k.spiele === 0) return null;
  k.duelle = berechneDuelle(chronologisch, m.teamtableId, jetzt);
  k.siegquote = Math.round((k.siege / k.spiele) * 100);
  k.schnittPlus = rund1(k.torePlus / k.spiele);
  k.schnittMinus = rund1(k.toreMinus / k.spiele);
  k.form = k.form.slice(-5);
  return k;
}

// Alle Spiele (auch künftige) je Gegner, chronologisch; abgesagte Spiele bleiben draußen. Gegner über die Teamtable-ID,
// nie über den Namen (siehe CLAUDE.md Teamidentität).
function berechneDuelle(chronologisch: SpielAnsicht[], eigeneId: string, jetzt: Date): Duell[] {
  const nachGegner = new Map<string, Duell>();
  for (const s of chronologisch) {
    if (s.status === "abgesagt") continue;
    const heim = s.heimTeamtableId === eigeneId;
    if (!heim && s.gastTeamtableId !== eigeneId) continue;
    const gegnerId = heim ? s.gastTeamtableId : s.heimTeamtableId;
    if (!gegnerId) continue;
    const hatErgebnis =
      s.toreHeim !== null && s.toreGast !== null && s.status !== "nicht_angetreten" && !istZwischenstand(s, jetzt);
    const duell = nachGegner.get(gegnerId) ?? { gegnerName: heim ? s.gastName : s.heimName, spiele: [] };
    duell.spiele.push({
      datum: s.datum,
      heim,
      eigen: hatErgebnis ? (heim ? s.toreHeim : s.toreGast) : null,
      gegner: hatErgebnis ? (heim ? s.toreGast : s.toreHeim) : null,
    });
    nachGegner.set(gegnerId, duell);
  }
  return [...nachGegner.values()];
}

export type Woche = {
  von: string;
  bis: string;
  spiele: number;
  gespielt: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  torePlus: number;
  toreMinus: number;
};

// "Spieltag in Zahlen": die laufende Woche (Mo-So, deutsche Zeit) über alle eigenen Mannschaften. Jedes Spiel zählt einmal;
// Duelle zweier eigener Mannschaften zählen als gespielt, aber ohne Sieg/Niederlage. null, wenn in der Woche kein Spiel ansteht.
export function berechneWoche(mannschaften: StatistikMannschaft[], jetzt: Date, heute: string): Woche | null {
  const tag = new Date(`${heute}T12:00:00Z`);
  const abMontag = (tag.getUTCDay() + 6) % 7;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const von = iso(new Date(tag.getTime() - abMontag * 86_400_000));
  const bis = iso(new Date(tag.getTime() + (6 - abMontag) * 86_400_000));
  const eigene = new Set(mannschaften.map((m) => m.teamtableId).filter((x): x is string => !!x));
  const gesehen = new Set<string>();
  const w: Woche = { von, bis, spiele: 0, gespielt: 0, siege: 0, unentschieden: 0, niederlagen: 0, torePlus: 0, toreMinus: 0 };
  for (const m of mannschaften) {
    for (const s of m.spiele) {
      if (gesehen.has(s.id) || s.datum < von || s.datum > bis || s.status === "abgesagt") continue;
      gesehen.add(s.id);
      w.spiele++;
      if (s.toreHeim === null || s.toreGast === null || s.status === "nicht_angetreten" || istZwischenstand(s, jetzt)) continue;
      w.gespielt++;
      const heimEigen = !!s.heimTeamtableId && eigene.has(s.heimTeamtableId);
      const gastEigen = !!s.gastTeamtableId && eigene.has(s.gastTeamtableId);
      if (heimEigen === gastEigen) continue; // intern oder unklar: nur als gespielt gezählt
      const eigen = heimEigen ? s.toreHeim : s.toreGast;
      const gegner = heimEigen ? s.toreGast : s.toreHeim;
      w.torePlus += eigen;
      w.toreMinus += gegner;
      if (eigen > gegner) w.siege++;
      else if (eigen === gegner) w.unentschieden++;
      else w.niederlagen++;
    }
  }
  return w.spiele > 0 ? w : null;
}

export function berechneVereinsKennzahlen(liste: MannschaftsKennzahlen[]) {
  const spiele = liste.reduce((s, k) => s + k.spiele, 0);
  const siege = liste.reduce((s, k) => s + k.siege, 0);
  const unentschieden = liste.reduce((s, k) => s + k.unentschieden, 0);
  const niederlagen = liste.reduce((s, k) => s + k.niederlagen, 0);
  const torePlus = liste.reduce((s, k) => s + k.torePlus, 0);
  const toreMinus = liste.reduce((s, k) => s + k.toreMinus, 0);
  return {
    mannschaften: liste.length,
    spiele,
    siege,
    unentschieden,
    niederlagen,
    siegquote: spiele > 0 ? Math.round((siege / spiele) * 100) : null,
    torePlus,
    toreMinus,
  };
}
