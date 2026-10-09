import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaSpiele, termine, vereine } from "@/db/schema";
import { baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { parseAnsetzungen } from "@/lib/nuliga/parsers/ansetzung";
import type { HoleHtml } from "@/lib/nuliga/client";
import { holeSyncBerechtigteVereinIds } from "@/lib/sync-berechtigung";

const normalisiere = (k: string | null) => k?.toLowerCase().replace(/[\s.]/g, "") ?? null;

const heuteBerlin = (jetzt: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt); // YYYY-MM-DD

export type AnsetzungsLauf = {
  gruppenGeprueft: number;
  gruppenUebrig: number; // wegen der Frist noch nicht geprüft (kommen im nächsten Lauf zuerst dran)
  gruppenFehler: number;
  aktualisiert: number; // Termine, deren Schiedsrichter-Kürzel neu gesetzt/geändert wurde
};

// Übernimmt das angesetzte Schiedsrichter-Kürzel aus den öffentlichen nuLiga-Gruppenseiten
// ("Spielplan (Gesamt)", nur dort steht die Ansetzung auch für Spiele weit in der Zukunft) in
// die mit dem Spiel VERKNÜPFTEN, privaten Termine (termin.nuliga_schiedsrichter_kuerzel) von
// Vereinen mit eingeschalteter Übernahme. STILL (keine Mail). Nur setzen/aktualisieren, nie
// löschen: fehlt die Ansetzung öffentlich (noch), bleibt der Termin wie er ist. Das Kürzel wird
// nie in liga_* gespeichert (Datenschutz, siehe nuliga/parsers/ansetzung.ts).
// Je Gruppe nur EINE Abfrage für alle betroffenen Vereine; die am längsten ungeprüften Gruppen
// zuerst, `frist` (ms-Zeitstempel) begrenzt die Laufzeit.
export async function uebernehmeAnsetzungen(opt: {
  holeHtml: HoleHtml;
  jetzt?: Date;
  frist?: number;
}): Promise<AnsetzungsLauf> {
  const jetzt = opt.jetzt ?? new Date();
  const heute = heuteBerlin(jetzt);
  // Nur Vereine, die jemand nutzt (aktiv oder gültiger Vorschau-Link), sonst kein Abruf (siehe lib/sync-berechtigung.ts).
  const berechtigte = [...(await holeSyncBerechtigteVereinIds(jetzt))];
  if (berechtigte.length === 0) return { gruppenGeprueft: 0, gruppenUebrig: 0, gruppenFehler: 0, aktualisiert: 0 };

  const gruppen = await adminDb
    .selectDistinct({
      id: ligaGruppen.id,
      verband: ligaGruppen.verband,
      championship: ligaGruppen.championship,
      gruppenNr: ligaGruppen.nuligaGroupId,
      geprueft: ligaGruppen.ansetzungGeprueftAm,
    })
    .from(ligaGruppen)
    .innerJoin(ligaSpiele, eq(ligaSpiele.gruppeId, ligaGruppen.id))
    .innerJoin(termine, eq(termine.ligaSpielId, ligaSpiele.id))
    .innerJoin(vereine, eq(vereine.id, termine.vereinId))
    .where(and(eq(ligaGruppen.quelle, "nuliga"), eq(vereine.ligaUebernahmeAktiv, true), inArray(vereine.id, berechtigte), gte(ligaSpiele.datum, heute)))
    .orderBy(sql`${ligaGruppen.ansetzungGeprueftAm} asc nulls first`);

  const lauf: AnsetzungsLauf = { gruppenGeprueft: 0, gruppenUebrig: 0, gruppenFehler: 0, aktualisiert: 0 };
  for (const g of gruppen) {
    if (opt.frist !== undefined && Date.now() > opt.frist) {
      lauf.gruppenUebrig++;
      continue;
    }
    const url = (runde: "vorrunde" | "rueckrunde") =>
      baueNuligaUrl(g.verband, "groupPage", {
        displayTyp: runde,
        displayDetail: "meetings",
        championship: g.championship,
        group: g.gruppenNr,
      });
    const karte = new Map<number, string>();
    let geladen = false;
    try {
      for (const a of parseAnsetzungen(await opt.holeHtml(url("vorrunde")))) karte.set(a.spielnummer, a.kuerzel);
      geladen = true;
    } catch {
      lauf.gruppenFehler++;
    }
    if (geladen) {
      try {
        for (const a of parseAnsetzungen(await opt.holeHtml(url("rueckrunde")))) karte.set(a.spielnummer, a.kuerzel);
      } catch {
        // Rückrunde (noch) nicht abrufbar: kein Fehler
      }
      const betroffene = await adminDb
        .select({ id: termine.id, kuerzel: termine.nuligaSchiedsrichterKuerzel, nummer: ligaSpiele.spielnummer })
        .from(termine)
        .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
        .innerJoin(vereine, eq(vereine.id, termine.vereinId))
        .where(and(eq(ligaSpiele.gruppeId, g.id), eq(vereine.ligaUebernahmeAktiv, true), inArray(vereine.id, berechtigte), gte(ligaSpiele.datum, heute)));
      for (const t of betroffene) {
        const oeffentlich = t.nummer === null ? undefined : karte.get(t.nummer);
        if (!oeffentlich || normalisiere(t.kuerzel) === normalisiere(oeffentlich)) continue;
        await adminDb.update(termine).set({ nuligaSchiedsrichterKuerzel: oeffentlich }).where(eq(termine.id, t.id));
        lauf.aktualisiert++;
      }
    }
    // auch bei Fehler als "versucht" markieren: eine dauerhaft kaputte Gruppe darf die
    // übrigen nicht blockieren
    await adminDb.update(ligaGruppen).set({ ansetzungGeprueftAm: new Date() }).where(eq(ligaGruppen.id, g.id));
    lauf.gruppenGeprueft++;
  }
  return lauf;
}
