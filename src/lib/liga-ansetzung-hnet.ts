import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaSpiele, termine, vereine } from "@/db/schema";
import { gruppiereSchiedsrichterUndZeitnehmer } from "@/lib/handball-net-scraper";
import { holeAlleSeiten } from "@/lib/handball-net/sync";
import type { HoleJson } from "@/lib/handball-net/client";
import type { AnsetzungsLauf } from "@/lib/liga-ansetzung";
import { holeSyncBerechtigteVereinIds } from "@/lib/sync-berechtigung";

const norm = (t: string | null) => t?.toLowerCase().replace(/\s+/g, " ").trim() ?? null;
const heuteBerlin = (jetzt: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt); // YYYY-MM-DD
const TAG_MS = 24 * 3600_000;

// Gegenstück zu uebernehmeAnsetzungen (nuLiga) für handball.net (DHB): die API liefert je Spiel die
// angesetzten Schiedsrichter UND Zeitnehmer mit Namen. Sie werden in die mit dem Spiel VERKNÜPFTEN,
// privaten Termine von Vereinen mit eingeschalteter Übernahme geschrieben (termin.handball_net_
// schiedsrichter / _zeitnehmer, dieselbe Form "Vorname Nachname, …" wie beim bisherigen Import) — nie
// in liga_* (Datenschutz). Nur setzen/ändern, nie löschen, still. Eine Abfrage je Phase für alle
// betroffenen Vereine, die am längsten ungeprüften Phasen zuerst, `frist` begrenzt die Laufzeit.
export async function uebernehmeHandballNetAnsetzungen(opt: {
  holeJson: HoleJson;
  jetzt?: Date;
  frist?: number;
}): Promise<AnsetzungsLauf> {
  const jetzt = opt.jetzt ?? new Date();
  const heute = heuteBerlin(jetzt);
  const bis = heuteBerlin(new Date(jetzt.getTime() + 400 * TAG_MS));
  // Nur Vereine, die jemand nutzt (aktiv oder gültiger Vorschau-Link), sonst kein Abruf (siehe lib/sync-berechtigung.ts).
  const berechtigte = [...(await holeSyncBerechtigteVereinIds(jetzt))];
  if (berechtigte.length === 0) return { gruppenGeprueft: 0, gruppenUebrig: 0, gruppenFehler: 0, aktualisiert: 0 };
  const phasen = await adminDb
    .selectDistinct({
      id: ligaGruppen.id,
      phaseId: ligaGruppen.nuligaGroupId,
      geprueft: ligaGruppen.ansetzungGeprueftAm,
    })
    .from(ligaGruppen)
    .innerJoin(ligaSpiele, eq(ligaSpiele.gruppeId, ligaGruppen.id))
    .innerJoin(termine, eq(termine.ligaSpielId, ligaSpiele.id))
    .innerJoin(vereine, eq(vereine.id, termine.vereinId))
    .where(and(eq(ligaGruppen.quelle, "handball_net"), eq(vereine.ligaUebernahmeAktiv, true), inArray(vereine.id, berechtigte), gte(ligaSpiele.datum, heute)))
    .orderBy(sql`${ligaGruppen.ansetzungGeprueftAm} asc nulls first`);

  const lauf: AnsetzungsLauf = { gruppenGeprueft: 0, gruppenUebrig: 0, gruppenFehler: 0, aktualisiert: 0 };
  for (const g of phasen) {
    if (opt.frist !== undefined && Date.now() > opt.frist) {
      lauf.gruppenUebrig++;
      continue;
    }
    const nachCode = new Map<string, { schiedsrichter: string | null; zeitnehmer: string | null }>();
    let geladen = false;
    try {
      const spiele = await holeAlleSeiten(
        opt.holeJson,
        `/api/new/matches?phase_id=${encodeURIComponent(g.phaseId)}&date_from=${heute}&date_to=${bis}`
      );
      for (const roh of spiele) {
        const m = roh as { code?: unknown; referees?: unknown };
        if (typeof m?.code !== "string" || !m.code) continue;
        nachCode.set(m.code, gruppiereSchiedsrichterUndZeitnehmer(m.referees));
      }
      geladen = true;
    } catch {
      lauf.gruppenFehler++;
    }
    if (geladen) {
      const betroffene = await adminDb
        .select({
          id: termine.id,
          schiedsrichter: termine.handballNetSchiedsrichter,
          zeitnehmer: termine.handballNetZeitnehmer,
          code: ligaSpiele.spielcode,
        })
        .from(termine)
        .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
        .innerJoin(vereine, eq(vereine.id, termine.vereinId))
        .where(and(eq(ligaSpiele.gruppeId, g.id), eq(vereine.ligaUebernahmeAktiv, true), inArray(vereine.id, berechtigte), gte(ligaSpiele.datum, heute)));
      for (const t of betroffene) {
        const oeffentlich = t.code ? nachCode.get(t.code) : undefined;
        if (!oeffentlich) continue;
        const neuSr = oeffentlich.schiedsrichter && norm(oeffentlich.schiedsrichter) !== norm(t.schiedsrichter) ? oeffentlich.schiedsrichter : null;
        const neuZn = oeffentlich.zeitnehmer && norm(oeffentlich.zeitnehmer) !== norm(t.zeitnehmer) ? oeffentlich.zeitnehmer : null;
        if (!neuSr && !neuZn) continue;
        await adminDb
          .update(termine)
          .set({
            ...(neuSr && { handballNetSchiedsrichter: neuSr }),
            ...(neuZn && { handballNetZeitnehmer: neuZn }),
          })
          .where(eq(termine.id, t.id));
        lauf.aktualisiert++;
      }
    }
    // auch bei Fehler als "versucht" markieren (eine kaputte Phase blockiert die übrigen nicht)
    await adminDb.update(ligaGruppen).set({ ansetzungGeprueftAm: new Date() }).where(eq(ligaGruppen.id, g.id));
    lauf.gruppenGeprueft++;
  }
  return lauf;
}
