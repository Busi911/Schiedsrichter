import { ligaSpiele, type ligaMannschaften } from "@/db/schema";
import { tagKey } from "@/lib/kalender";

// Reine Hilfsfunktionen für Spiele der öffentlichen Seiten (ohne DB-Zugriff,
// damit sie ohne Umgebung getestet werden können).

export type SpielAnsicht = typeof ligaSpiele.$inferSelect & {
  // Verband der Gruppe (aus liga_gruppen.verband) — für den Spielbericht-Link
  // (match-provider.ts: baueBerichtUrl braucht die Domain je Verband).
  // Optional, da nicht alle Queries ihn befüllen (z.B. Admin-Dashboard).
  verband?: string;
};

const ERGEBNIS_STATI = new Set(["gespielt", "nicht_angetreten"]);

export function hatErgebnis(s: SpielAnsicht): boolean {
  return s.toreHeim !== null && s.toreGast !== null;
}

// Bereits gespielt = Ergebnis vorhanden bzw. gewertet. Alles andere mit
// Datum ab heute gilt als anstehend (abgesagte Spiele bleiben sichtbar, mit
// Status-Hinweis, bis ein neuer Termin feststeht).
export function istVergangen(s: SpielAnsicht): boolean {
  return hatErgebnis(s) || ERGEBNIS_STATI.has(s.status);
}

export function istAnstehend(s: SpielAnsicht, jetzt: Date): boolean {
  if (istVergangen(s)) return false;
  return s.datum >= tagKey(jetzt);
}

export function sortiereChronologisch<T extends SpielAnsicht>(spiele: T[]): T[] {
  return [...spiele].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      (a.uhrzeit ?? "99:99").localeCompare(b.uhrzeit ?? "99:99") ||
      (a.spielnummer ?? 0) - (b.spielnummer ?? 0) ||
      (a.spielcode ?? "").localeCompare(b.spielcode ?? "")
  );
}

// Filter-Gruppen der Vereinsseite (Chips): Herren, Damen, Jugend, Kinder.
export type SpielGruppe = "herren" | "damen" | "jugend" | "kinder";

export function spielGruppe(kategorie: (typeof ligaMannschaften.$inferSelect)["kategorie"]): SpielGruppe {
  switch (kategorie) {
    case "herren":
      return "herren";
    case "damen":
      return "damen";
    case "jugend_maennlich":
    case "jugend_weiblich":
      return "jugend";
    default:
      return "kinder";
  }
}

export type VereinsSpiel = {
  spiel: SpielAnsicht;
  // Alle eigenen Mannschaften, die in diesem Spiel antreten (zwei eigene
  // Teams im selben Spiel erscheinen nur einmal).
  teams: string[];
  // Teamtable der ersten eigenen Mannschaft (für Hervorhebung und Ausgang).
  eigenTeamtable: string | null;
  gruppe: SpielGruppe;
  // IDs der beteiligten eigenen Mannschaften (für den Favoriten-Filter).
  mannschaftIds: string[];
};

type MannschaftSpiele = {
  id: string;
  name: string;
  kategorie: (typeof ligaMannschaften.$inferSelect)["kategorie"];
  teamtableId: string | null;
  spiele: SpielAnsicht[];
};

// Spiele aller Mannschaften vereinsweit: Ergebnisse (neueste zuerst) und
// anstehende Spiele (nächste zuerst).
export function sammleVereinsSpiele(
  mannschaften: MannschaftSpiele[],
  jetzt: Date,
  grenzen: { ergebnisse: number; anstehend: number } = { ergebnisse: 40, anstehend: 60 }
): { ergebnisse: VereinsSpiel[]; anstehend: VereinsSpiel[] } {
  const alle = new Map<string, VereinsSpiel>();
  for (const m of mannschaften) {
    for (const s of m.spiele) {
      if (!istVergangen(s) && !istAnstehend(s, jetzt)) continue;
      const eintrag = alle.get(s.id) ?? {
        spiel: s,
        teams: [],
        eigenTeamtable: m.teamtableId,
        gruppe: spielGruppe(m.kategorie),
        mannschaftIds: [],
      };
      eintrag.teams.push(m.name);
      eintrag.mannschaftIds.push(m.id);
      alle.set(s.id, eintrag);
    }
  }
  const eintraege = [...alle.values()];
  const reihenfolge = new Map(
    sortiereChronologisch(eintraege.map((e) => e.spiel)).map((s, i) => [s.id, i] as const)
  );
  const nachZeit = (a: VereinsSpiel, b: VereinsSpiel) =>
    reihenfolge.get(a.spiel.id)! - reihenfolge.get(b.spiel.id)!;
  return {
    ergebnisse: eintraege
      .filter((e) => istVergangen(e.spiel))
      .sort((a, b) => nachZeit(b, a))
      .slice(0, grenzen.ergebnisse),
    anstehend: eintraege
      .filter((e) => !istVergangen(e.spiel))
      .sort(nachZeit)
      .slice(0, grenzen.anstehend),
  };
}
