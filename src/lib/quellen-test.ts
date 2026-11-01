import { holeAlleSeiten, holeTeamsDesVereins, waehleSaison } from "@/lib/handball-net/sync";
import type { TestStand } from "@/lib/sync-ueberwachung";
import type { HoleJson } from "@/lib/handball-net/client";
import { parsePhasen, parseSaisons, parseSpiele, parseTeam } from "@/lib/handball-net/modell";
import type { HoleHtml } from "@/lib/nuliga/client";
import { parseClubTeams } from "@/lib/nuliga/parsers/club-teams";
import { parseVereinsInfo } from "@/lib/nuliga/parsers/vereinsinfo";
import { baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { saisonLabel } from "@/lib/saison";
import { BUNDESLIGEN, type BundesLiga } from "@/lib/sources/match";
import { parseNdrSeite } from "@/lib/sources/ndr/parser";
import { spieltagPfad } from "@/lib/sources/ndr/urls";
import type { HoleSeite } from "@/lib/sources/spieltag/types";

// Aktiver Selbsttest der Datenquellen: ruft die Quellen WIRKLICH ab (kleine, feste Anzahl Anfragen) und prüft, ob die Antwort
// noch so aussieht, wie unsere Parser sie erwarten. Die Überwachung (sync-ueberwachung.ts) sieht nur Zeitstempel veralteter Daten —
// sie kann nicht unterscheiden, ob die Quelle nicht antwortet, ihr Format sich geändert hat oder nur der Cron nicht lief.
// Schreibt nichts in liga_*; Personendaten werden nicht gelesen (nur Zähler und Namen von Mannschaften/Vereinen).

import type { QuellenArt } from "@/lib/sync-ueberwachung";
export type QuellenPruefung = {
  /** Stabil, z.B. "handball_net:saisons" (Schlüssel für die gespeicherte Historie). */
  schluessel: string;
  quelle: QuellenArt;
  name: string;
  ok: boolean;
  /** true = nicht prüfbar, weil Testdaten fehlen (kein Verein mit dieser Quelle); zählt weder als Erfolg noch als Fehler. */
  uebersprungen?: boolean;
  dauerMs: number;
  detail: string;
};

type Messung = { ok: boolean; detail: string; uebersprungen?: boolean };
const fehlerText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

async function messe(quelle: QuellenArt, schluessel: string, name: string, fn: () => Promise<Messung>): Promise<QuellenPruefung> {
  const start = Date.now();
  try {
    const r = await fn();
    return { schluessel: `${quelle}:${schluessel}`, quelle, name, ok: r.ok, uebersprungen: r.uebersprungen, dauerMs: Date.now() - start, detail: r.detail };
  } catch (err) {
    return { schluessel: `${quelle}:${schluessel}`, quelle, name, ok: false, dauerMs: Date.now() - start, detail: fehlerText(err) };
  }
}

const alsObj = (x: unknown): Record<string, unknown> | null => (typeof x === "object" && x !== null ? (x as Record<string, unknown>) : null);

export type TestEingabe = {
  jetzt?: Date;
  holeJson: HoleJson;
  holeHtml: HoleHtml;
  holeNdr: HoleSeite;
  /** Eine konkrete handball.net-Vereins-ID eines aktiven Vereins (für Teamliste und Spiele). */
  handballNetClubId: string | null;
  /** Eine konkrete nuLiga-Vereins-ID (HHV) eines aktiven Vereins. */
  nuligaClubId: string | null;
};

// handball.net: Saisonliste -> Teamliste eines echten Vereins -> Wettbewerbe und Spiele eines Teams. Dieselben Aufrufe wie der Sync,
// damit "Test grün" auch "Sync kann laufen" heißt. Folgeschritte hängen voneinander ab und werden bei einem früheren Fehler übersprungen.
export async function pruefeHandballNet(e: TestEingabe): Promise<QuellenPruefung[]> {
  const jetzt = e.jetzt ?? new Date();
  const ergebnis: QuellenPruefung[] = [];
  let saisonId: string | null = null;
  let von = "";
  let bis = "";

  ergebnis.push(
    await messe("handball_net", "saisons", "Saisonliste", async () => {
      const saisons = parseSaisons(alsObj(await e.holeJson("/api/new/seasons"))?.data);
      if (saisons.length === 0) return { ok: false, detail: "Antwort ohne lesbare Saisons (Format geändert?)" };
      const s = waehleSaison(saisons, jetzt);
      saisonId = s?.id ?? null;
      von = s?.start ?? "";
      bis = s?.ende ?? "";
      return { ok: true, detail: `${saisons.length} Saisons, aktuell ${s?.label ?? "unbekannt"}` };
    })
  );

  let teamId: string | null = null;
  ergebnis.push(
    await messe("handball_net", "teams", "Teamliste eines Vereins", async () => {
      if (!e.handballNetClubId) return { ok: true, uebersprungen: true, detail: "Kein aktiver Verein mit handball.net-Vereins-ID" };
      const { teams, fehler } = await holeTeamsDesVereins(e.holeJson, e.handballNetClubId, saisonId);
      if (!teams) return { ok: false, detail: `Verein ${e.handballNetClubId}: keine Teams lesbar (${fehler.join("; ")})` };
      teamId = teams[0]?.id ?? null;
      return { ok: true, detail: `Verein ${e.handballNetClubId}: ${teams.length} Teams` };
    })
  );

  let phaseId: string | null = null;
  ergebnis.push(
    await messe("handball_net", "wettbewerbe", "Wettbewerbe eines Teams", async () => {
      if (!teamId) return { ok: true, uebersprungen: true, detail: "Übersprungen (kein Team aus der Teamliste)" };
      const team = parseTeam(alsObj(await e.holeJson(`/api/new/teams/${encodeURIComponent(teamId)}`))?.data);
      if (!team) return { ok: false, detail: "Team-Detail nicht lesbar (Format geändert?)" };
      const antwort = alsObj(
        await e.holeJson(`/api/new/teams/${encodeURIComponent(teamId)}/competitions${saisonId ? `?season_id=${encodeURIComponent(saisonId)}` : ""}`)
      );
      const phasen = parsePhasen(Array.isArray(antwort?.data) ? (antwort.data as unknown[]) : []);
      if (phasen.length === 0) return { ok: true, uebersprungen: true, detail: `Team ${team.name}: keine Wettbewerbe in dieser Saison (nicht prüfbar)` };
      phaseId = phasen[0].id;
      return { ok: true, detail: `Team ${team.name}: ${phasen.length} Wettbewerb(e)` };
    })
  );

  ergebnis.push(
    await messe("handball_net", "spiele", "Spiele eines Teams", async () => {
      if (!teamId || !phaseId) return { ok: true, uebersprungen: true, detail: "Übersprungen (kein Wettbewerb)" };
      const pfad = `/api/new/matches?team_id=${encodeURIComponent(teamId)}&phase_id=${encodeURIComponent(phaseId)}${von ? `&date_from=${von}&date_to=${bis}` : ""}`;
      const roh = await holeAlleSeiten(e.holeJson, pfad);
      const spiele = parseSpiele(roh);
      if (roh.length > 0 && spiele.length === 0) return { ok: false, detail: `${roh.length} Einträge, aber keiner lesbar (Format geändert?)` };
      return { ok: true, detail: `${spiele.length} Spiele gelesen` };
    })
  );
  return ergebnis;
}

// nuLiga (HHV): die beiden Seiten, auf denen Struktur-Sync und Vereinseinrichtung aufbauen.
export async function pruefeNuliga(e: TestEingabe): Promise<QuellenPruefung[]> {
  const id = e.nuligaClubId;
  const ohneVerein = { ok: true, uebersprungen: true, detail: "Kein aktiver Verein mit nuLiga-Vereins-ID" } as const;
  return [
    await messe("nuliga", "club-teams", "Mannschaftsliste eines Vereins (clubTeams)", async () => {
      if (!id) return ohneVerein;
      const { daten } = parseClubTeams(await e.holeHtml(baueNuligaUrl("HHV", "clubTeams", { club: id })));
      if (daten.teams.length === 0) return { ok: false, detail: `Verein ${id}: keine Mannschaften lesbar (Seite leer oder Format geändert?)` };
      return { ok: true, detail: `Verein ${id}: ${daten.teams.length} Mannschaften` };
    }),
    await messe("nuliga", "club-info", "Vereinsseite (clubInfoDisplay)", async () => {
      if (!id) return ohneVerein;
      const { daten } = parseVereinsInfo(await e.holeHtml(baueNuligaUrl("HHV", "clubInfoDisplay", { club: id })));
      if (!daten.name) return { ok: false, detail: `Verein ${id}: kein Vereinsname lesbar (Format geändert?)` };
      return { ok: true, detail: `Verein ${id}: „${daten.name}“` };
    }),
  ];
}

// NDR: Spieltag 1 beider Ligen (existiert die ganze Saison, braucht keine Zuordnung).
export async function pruefeNdr(e: TestEingabe): Promise<QuellenPruefung[]> {
  const jetzt = e.jetzt ?? new Date();
  const saison = saisonLabel(jetzt);
  const start = Number(saison.slice(0, 4));
  const ergebnis: QuellenPruefung[] = [];
  for (const liga of ["hbl1", "hbl2"] as BundesLiga[]) {
    ergebnis.push(
      await messe("ndr", liga, `${BUNDESLIGEN[liga].kurz}: Spieltag 1`, async () => {
        const seite = parseNdrSeite(await e.holeNdr(spieltagPfad(liga, 1, start)), { liga, saison, jetzt });
        if (seite.spiele.length === 0) return { ok: false, detail: `Keine Spiele lesbar (Seite leer oder Format geändert?)${seite.warnungen[0] ? `: ${seite.warnungen[0]}` : ""}` };
        return { ok: true, detail: `${seite.spiele.length} Spiele, ${[...seite.tabellen.values()].reduce((n, t) => n + t.length, 0)} Tabellenzeilen` };
      })
    );
  }
  return ergebnis;
}

export async function pruefeAlleQuellen(e: TestEingabe): Promise<QuellenPruefung[]> {
  // Nacheinander (die Clients halten ohnehin ihren Mindestabstand), Quellen unabhängig voneinander.
  return [...(await pruefeHandballNet(e)), ...(await pruefeNuliga(e)), ...(await pruefeNdr(e))];
}

// --- Auswertung für die Überwachung (rein) -----------------------------------

/** Neuer Stand aus dem alten und dem aktuellen Ergebnis. Übersprungene Prüfungen ändern nichts. */
export function schreibeStandFort(alt: TestStand | undefined, p: QuellenPruefung, jetzt: Date): TestStand | null {
  if (p.uebersprungen) return null;
  return {
    schluessel: p.schluessel,
    letzterVersuchAm: jetzt,
    letzterErfolgAm: p.ok ? jetzt : (alt?.letzterErfolgAm ?? null),
    fehlerInFolge: p.ok ? 0 : (alt?.fehlerInFolge ?? 0) + 1,
    letzterFehler: p.ok ? null : p.detail,
  };
}
