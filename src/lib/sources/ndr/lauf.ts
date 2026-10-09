import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten, ligaVereine } from "@/db/schema";
import { holeSyncBerechtigteVereinIds } from "@/lib/sync-berechtigung";
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
  // "Zugeordnet" heißt: mindestens ein NDR-Team gehört zu einem Verein, den jemand nutzt (aktiv oder in Vorbereitung mit gültigem
  // Vorschau-Link) — ein Team bei einem ungenutzten Verein löst keinen Abruf aus (siehe lib/sync-berechtigung.ts).
  const berechtigte = await holeSyncBerechtigteVereinIds(jetzt);
  const identitaeten = await adminDb
    .select({ vereinId: ligaVereine.vereinId })
    .from(ligaExterneIdentitaeten)
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaExterneIdentitaeten.ligaVereinId))
    .where(eq(ligaExterneIdentitaeten.quelle, NDR_QUELLE));
  const zugeordnet = identitaeten.some((i) => berechtigte.has(i.vereinId));
  if (!zugeordnet && !opt.erzwingen) return { liga, status: "uebersprungen", text: `${BUNDESLIGEN[liga].kurz}: kein Team einem genutzten Verein zugeordnet` };
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
