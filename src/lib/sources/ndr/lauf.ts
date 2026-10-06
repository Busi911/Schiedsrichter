import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten } from "@/db/schema";
import type { SyncErgebnis } from "@/lib/nuliga/sync";
import { saisonLabel } from "@/lib/saison";
import { BUNDESLIGEN, type BundesLiga } from "../match";
import { synchronisiereSpieltage } from "../spieltag/sync";
import { holeNdrSeite, mitLaufCache } from "./client";
import { NDR_QUELLE } from "./sync-profil";
import { ndrSyncProfil } from "./sync-profil";

export const NDR_LIGA_LISTE: BundesLiga[] = ["hbl1", "hbl2"];

export type NdrLaufErgebnis = { liga: BundesLiga; status: SyncErgebnis["status"] | "uebersprungen"; text: string };

// Synchronisiert EINE Liga von ndr.de. Ohne eine einzige Team-Zuordnung zu einem Verein passiert NICHTS (kein Abruf) — Tabelle und Spiele
// werden nur für zugeordnete Teams gebraucht. `erzwingen` (nur Systemadmin, von Hand): einmal die Tabellenseite laden, damit die Teams zum
// Zuordnen in /system/ndr erscheinen.
export async function synchronisiereNdrLiga(liga: BundesLiga, opt: { voll?: boolean; erzwingen?: boolean; jetzt?: Date; frist?: number } = {}): Promise<NdrLaufErgebnis> {
  const jetzt = opt.jetzt ?? new Date();
  const saison = saisonLabel(jetzt);
  const zugeordnet = await adminDb.query.ligaExterneIdentitaeten.findFirst({ where: eq(ligaExterneIdentitaeten.quelle, NDR_QUELLE), columns: { id: true } });
  if (!zugeordnet && !opt.erzwingen) return { liga, status: "uebersprungen", text: `${BUNDESLIGEN[liga].kurz}: kein Team einem Verein zugeordnet` };
  try {
    const r = await synchronisiereSpieltage({
      db: adminDb,
      hole: mitLaufCache(holeNdrSeite),
      liga,
      saison,
      jetzt,
      frist: opt.frist,
      voll: opt.voll,
      nurTabelle: !zugeordnet && opt.erzwingen,
      profil: ndrSyncProfil(Number(saison.slice(0, 4))),
    });
    return {
      liga,
      status: r.status,
      text: `${BUNDESLIGEN[liga].kurz}: ${r.status}, ${r.neu} neu, ${r.aktualisiert} geändert, ${r.anfragen} Abrufe${r.unvollstaendig ? " (wird beim nächsten Lauf fortgesetzt)" : ""}${r.meldungen.length ? ` — ${r.meldungen.join("; ")}` : ""}`,
    };
  } catch (err) {
    return { liga, status: "fehler", text: `${BUNDESLIGEN[liga].kurz}: ${err instanceof Error ? err.message : String(err)}` };
  }
}
