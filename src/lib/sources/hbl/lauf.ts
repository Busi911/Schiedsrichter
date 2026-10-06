import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten } from "@/db/schema";
import { saisonLabel } from "@/lib/saison";
import { HBL_WETTBEWERBE, type HblWettbewerb } from "../match";
import { holeHblSeite } from "./client";
import { HBL_ENDPUNKTE, hblParser } from "./parser";
import { synchronisiereHbl } from "./sync";
import type { SyncErgebnis } from "@/lib/nuliga/sync";

// Wettbewerbe mit bekannten öffentlichen Seiten (DHB-Pokal und Super Cup folgen, sobald Adressen vorliegen).
export const HBL_LIGEN: HblWettbewerb[] = ["hbl1", "hbl2"];

export type HblLaufErgebnis = { wettbewerb: HblWettbewerb; status: SyncErgebnis["status"] | "uebersprungen"; text: string };

// Synchronisiert 1. und 2. HBL (Tabelle + Spielplan; Teamübersicht nur auf Wunsch/Bedarf). Ohne eine einzige Team-Zuordnung zu einem
// Verein passiert NICHTS (kein Abruf bei der HBL) — Tabellen und Spiele werden nur für zugeordnete Teams gebraucht.
// `erzwingen` (nur Systemadmin, von Hand): einmal laden, damit die Teams zum Zuordnen in /system/hbl erscheinen.
export async function synchronisiereHblLigen(opt: { mitTeams?: boolean; jetzt?: Date; ligen?: HblWettbewerb[]; erzwingen?: boolean } = {}): Promise<HblLaufErgebnis[]> {
  const jetzt = opt.jetzt ?? new Date();
  const zugeordnet = await adminDb.query.ligaExterneIdentitaeten.findFirst({
    where: eq(ligaExterneIdentitaeten.quelle, "hbl"),
    columns: { id: true },
  });
  const saison = saisonLabel(jetzt);
  const ergebnisse: HblLaufErgebnis[] = [];
  for (const wettbewerb of opt.ligen ?? HBL_LIGEN) {
    if (!zugeordnet && !opt.erzwingen) {
      ergebnisse.push({ wettbewerb, status: "uebersprungen", text: "kein HBL-Team einem Verein zugeordnet" });
      continue;
    }
    try {
      const r = await synchronisiereHbl({ db: adminDb, hole: holeHblSeite, endpunkte: HBL_ENDPUNKTE, parser: hblParser, wettbewerb, saison, jetzt, mitTeams: opt.mitTeams });
      ergebnisse.push({
        wettbewerb,
        status: r.status,
        text: `${HBL_WETTBEWERBE[wettbewerb].kurz}: ${r.status}, ${r.neu} neu, ${r.aktualisiert} geändert, ${r.anfragen} Abrufe${r.meldungen.length ? ` — ${r.meldungen.join("; ")}` : ""}`,
      });
    } catch (err) {
      ergebnisse.push({ wettbewerb, status: "fehler", text: `${HBL_WETTBEWERBE[wettbewerb].kurz}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return ergebnisse;
}
