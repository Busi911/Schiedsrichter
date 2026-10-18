import { ligaSpiele, type ligaMannschaften } from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import { ZEITZONE } from "@/lib/format";
import { istZwischenstand, laeuftMitStand, LAUF_FENSTER_MS, laeuftVermutlich } from "@/lib/liga-spiel-status";

// Reine Hilfsfunktionen für Spiele der öffentlichen Seiten (ohne DB-Zugriff,
// damit sie ohne Umgebung getestet werden können).

export type SpielAnsicht = typeof ligaSpiele.$inferSelect & {
  // Verband der Gruppe (aus liga_gruppen.verband) — für den Spielbericht-Link
  // (match-provider.ts: baueBerichtUrl braucht die Domain je Verband).
  // Optional, da nicht alle Queries ihn befüllen (z.B. Admin-Dashboard).
  verband?: string;
};

// Verlegtes Spiel: der ursprüngliche Termin (nuLiga nennt ihn im Hinweis der Zeitzelle), z.B. "Sa., 10.10., 16:00 Uhr". Sonst null.
export function ursprungsTermin(s: Pick<SpielAnsicht, "status" | "urspruenglicherBeginn">): string | null {
  if (s.status !== "verlegt" || !s.urspruenglicherBeginn) return null;
  const d = new Date(s.urspruenglicherBeginn);
  const tag = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: ZEITZONE }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZEITZONE }).format(d);
  return `${tag}, ${zeit} Uhr`;
}

const ERGEBNIS_STATI = new Set(["gespielt", "nicht_angetreten"]);

export function hatErgebnis(s: SpielAnsicht): boolean {
  return s.toreHeim !== null && s.toreGast !== null;
}

// So lange (in Tagen) bleibt ein vergangenes Spiel OHNE Ergebnis sichtbar ("Ergebnis ausstehend"); danach gilt es
// als nie erfasst und fällt aus den Listen.
export const AUSSTEHEND_TAGE = 14;

// Vergangenes Spiel ohne Ergebnis (der Verband trägt es oft erst nach ein bis zwei Tagen ein) oder abgesagt/verlegt
// ohne neuen Termin: bleibt sichtbar, statt zu verschwinden. Ein Zwischenstand (Spiel läuft) zählt nicht dazu.
export function istErgebnisAusstehend(s: SpielAnsicht, jetzt: Date): boolean {
  if (hatErgebnis(s) || ERGEBNIS_STATI.has(s.status)) return false;
  const heute = tagKey(jetzt);
  if (s.datum >= heute) return false;
  const grenze = tagKey(new Date(jetzt.getTime() - AUSSTEHEND_TAGE * 24 * 60 * 60 * 1000));
  return s.datum >= grenze;
}

// Gehört in die Ergebnisliste: Endergebnis (auch vorläufig), gewertet bzw. nicht angetreten oder ein vergangenes Spiel
// ohne Ergebnis oder mit noch nicht genehmigtem Stand (dann "Ergebnis folgt" statt der Zahl). Ein LAUFENDES Spiel mit
// Zwischenstand gehört NICHT dazu (siehe istAnstehend) — es zeigt "Läuft gerade".
export function istVergangen(s: SpielAnsicht, jetzt: Date): boolean {
  if (laeuftMitStand(s, jetzt)) return false;
  return hatErgebnis(s) || ERGEBNIS_STATI.has(s.status) || istErgebnisAusstehend(s, jetzt);
}

// Noch nicht abgeschlossen: ab heute angesetzt oder gerade laufend (auch wenn der Anwurf gestern Abend war und der Tag
// inzwischen gewechselt hat). Abgesagte Spiele ab heute bleiben sichtbar, mit Status-Hinweis.
export function istAnstehend(s: SpielAnsicht, jetzt: Date): boolean {
  if (istVergangen(s, jetzt)) return false;
  return s.datum >= tagKey(jetzt) || laeuftMitStand(s, jetzt);
}

// Letztes ECHTES Ergebnis einer (chronologisch sortierten) Spieleliste: ein laufendes Spiel mit Zwischenstand zählt nicht.
export function letztesErgebnis<T extends SpielAnsicht>(spiele: T[], jetzt: Date): T | null {
  for (let i = spiele.length - 1; i >= 0; i--) {
    if (hatErgebnis(spiele[i]) && !istZwischenstand(spiele[i], jetzt)) return spiele[i];
  }
  return null;
}

// Was statt eines Ergebnisses angezeigt wird: nicht genehmigte Stände zeigen wir NIE als Zahl (veraltet oder laufend,
// sieht wie ein Endstand aus). "laeuft" = läuft vermutlich, "ergebnis_folgt" = vermutlich vorbei, noch nicht genehmigt,
// "ausstehend" = vergangen, der Verband hat noch nichts eingetragen.
export type ErgebnisHinweis = "laeuft" | "ergebnis_folgt" | "ausstehend";

export function ergebnisHinweis(s: SpielAnsicht, jetzt: Date): ErgebnisHinweis | null {
  if (laeuftVermutlich(s, jetzt)) return "laeuft";
  if (istZwischenstand(s, jetzt)) return "ergebnis_folgt";
  // Heutiges Spiel ohne Ergebnis, dessen Anwurf länger als das Lauf-Fenster her ist: vermutlich vorbei, der Verband
  // hat nur noch nichts eingetragen (ab morgen "Ergebnis ausstehend").
  if (
    !hatErgebnis(s) &&
    s.status === "geplant" &&
    s.beginn &&
    s.beginn.getTime() < jetzt.getTime() - LAUF_FENSTER_MS
  ) {
    return "ergebnis_folgt";
  }
  if (s.status !== "abgesagt" && istErgebnisAusstehend(s, jetzt)) return "ausstehend";
  return null;
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
): { ergebnisse: VereinsSpiel[]; anstehend: VereinsSpiel[]; heute: VereinsSpiel[] } {
  const alle = new Map<string, VereinsSpiel>();
  for (const m of mannschaften) {
    for (const s of m.spiele) {
      if (!istVergangen(s, jetzt) && !istAnstehend(s, jetzt)) continue;
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
  const anstehend = eintraege
    .filter((e) => !istVergangen(e.spiel, jetzt))
    .sort(nachZeit);
  // "Heute": noch offene Spiele des heutigen Tages und laufende Spiele (auch nach Mitternacht).
  const heuteKey = tagKey(jetzt);
  const heute = anstehend.filter((e) => e.spiel.datum === heuteKey || laeuftMitStand(e.spiel, jetzt));
  return {
    heute,
    ergebnisse: eintraege
      .filter((e) => istVergangen(e.spiel, jetzt))
      .sort((a, b) => nachZeit(b, a))
      .slice(0, grenzen.ergebnisse),
    anstehend: anstehend.slice(0, grenzen.anstehend),
  };
}
