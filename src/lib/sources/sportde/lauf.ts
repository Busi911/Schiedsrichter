import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten } from "@/db/schema";
import type { SyncErgebnis } from "@/lib/nuliga/sync";
import { saisonLabel } from "@/lib/saison";
import { SPORTDE_LIGEN, type SportDeLiga } from "../match";
import { holeSportDeSeite } from "./client";
import { synchronisiereSportDe } from "./sync";

export const SPORTDE_LIGA_LISTE: SportDeLiga[] = ["hbl1", "hbl2"];

export type SportDeLaufErgebnis = { liga: SportDeLiga; status: SyncErgebnis["status"] | "uebersprungen"; text: string };

// Synchronisiert EINE Liga. Ohne eine einzige Team-Zuordnung zu einem Verein passiert NICHTS (kein Abruf bei sport.de) — Tabellen und Spiele werden
// nur für zugeordnete Teams gebraucht. `erzwingen` (nur Systemadmin, von Hand): einmal die Tabellenseite laden, damit die Teams zum Zuordnen
// in /system/sportde erscheinen.
export async function synchronisiereSportDeLiga(liga: SportDeLiga, opt: { voll?: boolean; erzwingen?: boolean; jetzt?: Date; frist?: number } = {}): Promise<SportDeLaufErgebnis> {
  const jetzt = opt.jetzt ?? new Date();
  const zugeordnet = await adminDb.query.ligaExterneIdentitaeten.findFirst({ where: eq(ligaExterneIdentitaeten.quelle, "sportde"), columns: { id: true } });
  if (!zugeordnet && !opt.erzwingen) return { liga, status: "uebersprungen", text: `${SPORTDE_LIGEN[liga].kurz}: kein Team einem Verein zugeordnet` };
  try {
    const r = await synchronisiereSportDe({
      db: adminDb,
      hole: holeSportDeSeite,
      liga,
      saison: saisonLabel(jetzt),
      jetzt,
      frist: opt.frist,
      voll: opt.voll,
      nurTabelle: !zugeordnet && opt.erzwingen,
      ohneWartezeit: opt.erzwingen,
    });
    return {
      liga,
      status: r.status,
      text: `${SPORTDE_LIGEN[liga].kurz}: ${r.status}, ${r.neu} neu, ${r.aktualisiert} geändert, ${r.anfragen} Abrufe${r.unvollstaendig ? " (wird beim nächsten Lauf fortgesetzt)" : ""}${r.meldungen.length ? ` — ${r.meldungen.join("; ")}` : ""}`,
    };
  } catch (err) {
    return { liga, status: "fehler", text: `${SPORTDE_LIGEN[liga].kurz}: ${err instanceof Error ? err.message : String(err)}` };
  }
}
