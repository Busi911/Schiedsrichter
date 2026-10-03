import type { ClubTeamEintrag, NuligaSpiel, TabellenZeile } from "./types";
import { saisonLabel } from "@/lib/saison";

// Reine Hilfsfunktionen des Syncs (ohne DB/Netzwerk, siehe sync.test.ts).

// Aktuelle Saison, falls vorhanden — sonst die neueste vorhandene reguläre
// (z.B. im Sommer, wenn nuLiga die neue Saison noch nicht angelegt hat).
export function waehleSaison(teams: ClubTeamEintrag[], jetzt: Date): string | null {
  const saisons = [...new Set(teams.filter((t) => t.regulaer && t.saison).map((t) => t.saison!))];
  if (saisons.length === 0) return null;
  const aktuell = saisonLabel(jetzt);
  if (saisons.includes(aktuell)) return aktuell;
  return saisons.sort().at(-1)!;
}

function normalisiereName(name: string): string {
  return name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, " ").trim();
}

// Ordnet eine Mannschaft aus clubTeams (kennt nur die Gruppe) der
// Tabellenzeile ihrer Gruppe zu. Dreistufig, weil Spielgemeinschaften
// anders heißen als die Mannschaft im Verein ("mJSG Heuchelheim/Bieber II"):
//  1. Name (Vereinsname-Bestandteil + Mannschaftsnummer) UND Rang/Punkte,
//  2. sonst eindeutiger Name, sonst (ohne Namenstreffer) eindeutiger Stand,
//  3. sonst keine Zuordnung (null) — die Mannschaft bleibt mit Rang/Punkten
//     aus clubTeams sichtbar, es werden nur keine Spiele importiert.
export function ermittleTeamtable(
  team: { rang: number | null; punkte: { plus: number; minus: number } | null; nummer: number },
  tabelle: TabellenZeile[],
  vereinsname: string
): string | null {
  const mitId = tabelle.filter((z) => z.teamtableId);
  if (mitId.length === 0) return null;

  const passtStand = (z: TabellenZeile) =>
    team.rang !== null &&
    z.rang === team.rang &&
    (!team.punkte || (z.punkte?.plus === team.punkte.plus && z.punkte?.minus === team.punkte.minus));

  // Name: Vereinsname-Bestandteil + passende Mannschaftsnummer.
  const roemisch = ["", "", " II", " III", " IV", " V", " VI"];
  const tokens = normalisiereName(vereinsname)
    .split(" ")
    .filter((t) => t.length >= 4 && !["verein", "sport", "handball"].includes(t));
  // nuLiga kürzt lange Namen in Tabellen ab ("Heuchelh./Bieber II"): daher
  // genügen die ersten 5 Buchstaben des Vereinsnamen-Bestandteils
  // ("Dutenh." für Dutenhofen, "Heuchelh." für Heuchelheim).
  const namensAnfaenge = tokens.map((t) => t.slice(0, 5));
  const namensTreffer = mitId.filter((z) => {
    const n = normalisiereName(z.mannschaft);
    if (!namensAnfaenge.some((a) => n.includes(a))) return false;
    return team.nummer === 1
      ? !/\s(ii|iii|iv|v|vi|\d)$/.test(n)
      : n.endsWith(normalisiereName(roemisch[team.nummer] ?? "")) || n.endsWith(` ${team.nummer}`);
  });

  // Ein veralteter Stand (clubTeams und groupPage zu verschiedenen Zeiten
  // geladen) darf nie auf eine FREMDE Mannschaft zeigen: Namens-Treffer
  // haben Vorrang, Rang+Punkte allein gelten nur, wenn kein Name passt
  // (Spielgemeinschaft mit vereinsfremdem Namen).
  const beides = namensTreffer.filter(passtStand);
  if (beides.length === 1) return beides[0].teamtableId;
  if (namensTreffer.length === 1) return namensTreffer[0].teamtableId;
  if (namensTreffer.length === 0) {
    const standTreffer = mitId.filter(passtStand);
    if (standTreffer.length === 1) return standTreffer[0].teamtableId;
  }
  return null;
}

// Heim/Gast-Namen des Spielplans -> teamtable-ID über die Gruppentabelle.
// Mehrdeutige Namen (zweimal derselbe Name in der Gruppe) -> null.
export function baueNamensIndex(tabelle: { name: string; teamtableId: string }[]) {
  const index = new Map<string, string | null>();
  for (const z of tabelle) {
    index.set(z.name, index.has(z.name) ? null : z.teamtableId);
  }
  return index;
}

// Der Name der Mannschaft, deren Portrait geladen wurde, steht in JEDEM ihrer
// Spiele (als Heim oder Gast). So lässt sich die eigene Seite auch dann
// bestimmen, wenn der Name im Spielplan von der Tabellenzeile abweicht
// (Schreibweise, Spielgemeinschaft). Nicht eindeutig -> null.
export function eigenerNameImPortrait(spiele: { heim: string; gast: string }[]): string | null {
  if (spiele.length === 0) return null;
  const gemeinsam = new Set([spiele[0].heim, spiele[0].gast]);
  for (const s of spiele.slice(1)) {
    for (const n of [...gemeinsam]) if (n !== s.heim && n !== s.gast) gemeinsam.delete(n);
  }
  // Bei nur einem Spiel ist das nicht entscheidbar.
  return spiele.length > 1 && gemeinsam.size === 1 ? [...gemeinsam][0] : null;
}

export type SpielFelder = {
  datum: string;
  uhrzeit: string | null;
  beginn: Date | null;
  urspruenglicherBeginn: Date | null;
  halleName: string | null;
  halleNummer: string | null;
  halleNuligaId: string | null;
  heimName: string;
  gastName: string;
  heimTeamtableId: string | null;
  gastTeamtableId: string | null;
  meetingId: string | null;
  toreHeim: number | null;
  toreGast: number | null;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  ergebnisBestaetigt: boolean;
  status: NuligaSpiel["status"];
};

export function spielZuFeldern(
  s: NuligaSpiel,
  namen: Map<string, string | null>
): SpielFelder {
  return {
    datum: s.datum,
    uhrzeit: s.uhrzeit,
    beginn: s.beginn,
    urspruenglicherBeginn: s.urspruenglicherBeginn,
    halleName: s.halle?.name ?? null,
    halleNummer: s.halle?.nummer ?? null,
    halleNuligaId: s.halle?.nuligaId ?? null,
    heimName: s.heim,
    gastName: s.gast,
    heimTeamtableId: namen.get(s.heim) ?? null,
    gastTeamtableId: namen.get(s.gast) ?? null,
    meetingId: s.meetingId,
    toreHeim: s.tore?.plus ?? null,
    toreGast: s.tore?.minus ?? null,
    halbzeitHeim: s.halbzeit?.plus ?? null,
    halbzeitGast: s.halbzeit?.minus ?? null,
    ergebnisBestaetigt: s.ergebnisBestaetigt,
    status: s.status,
  };
}

const zeit = (d: Date | null) => (d ? d.getTime() : null);

// Nur schreiben, wenn sich etwas geändert hat — sonst würde jeder Lauf jede
// Zeile neu schreiben (und "aktualisiert" falsch zählen).
export function spielGeaendert(bestehend: SpielFelder, neu: SpielFelder): boolean {
  return (
    (Object.keys(neu) as (keyof SpielFelder)[]).some((k) => {
      if (k === "beginn" || k === "urspruenglicherBeginn") {
        return zeit(bestehend[k]) !== zeit(neu[k]);
      }
      return bestehend[k] !== neu[k];
    })
  );
}

// Eine Ergebnis-Änderung (neu eingetragen/korrigiert) — Auslöser, die
// Gruppentabelle neu zu laden.
export function ergebnisGeaendert(bestehend: SpielFelder | undefined, neu: SpielFelder): boolean {
  return (
    neu.toreHeim !== null &&
    (!bestehend || bestehend.toreHeim !== neu.toreHeim || bestehend.toreGast !== neu.toreGast)
  );
}

// Wie oft ein Verein neu synchronisiert werden soll: Spieltagsnah (Spiel
// heute/gestern/morgen) öfter, sonst seltener — schont nuLiga.
export function spieleIntervallMinuten(spieltagsnah: boolean): number {
  return spieltagsnah ? 45 : 6 * 60;
}
export const STRUKTUR_INTERVALL_MINUTEN = 20 * 60;

// Mannschaftsnummer aus dem Portrait-Kopf ("TSF Heuchelheim 1. Männer/männlich",
// "… II. Männer"): die Ordnungszahl steht mit Punkt vor der Kategorie.
export function nummerAusPortraitName(name: string | null): number | null {
  if (!name) return null;
  const t = name.replace(/\u00a0/g, " ").match(/(?:^|\s)(\d{1,2}|VI|V|IV|III|II|I)\.\s/);
  if (!t) return null;
  const roemisch: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
  return /^\d+$/.test(t[1]) ? Number(t[1]) : (roemisch[t[1]] ?? null);
}

// Wie lange ein bereits laufender Abruf nach der Frist noch warten darf. Ohne diese Grenze kann ein
// langsamer nuLiga-Abruf (Timeout 20 s, bei 429/5xx plus 5 s Pause und zweiter Versuch) kurz vor
// der Frist starten und die Funktion über das 60-s-Limit von Vercel treiben (504, der ganze Lauf
// geht verloren, nichts wird protokolliert).
export const FRIST_NACHLAUF_MS = 8_000;

export async function mitHarterFrist<T>(
  frist: number | undefined,
  abruf: () => Promise<T>,
  beiZeitlimit?: () => void
): Promise<T> {
  if (frist === undefined) return abruf();
  const rest = frist + FRIST_NACHLAUF_MS - Date.now();
  const zeitlimit = () => {
    beiZeitlimit?.();
    return new Error("Zeitlimit erreicht – Abruf abgebrochen, wird beim nächsten Lauf wiederholt");
  };
  if (rest <= 0) throw zeitlimit();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      abruf(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(zeitlimit()), rest);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
