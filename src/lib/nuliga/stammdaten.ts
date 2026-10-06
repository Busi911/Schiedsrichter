import { eq } from "drizzle-orm";
import { ligaVereine } from "@/db/schema";
import type { LigaDb } from "./sync";
import type { VereinsInfo } from "./types";

const URL_OK = /^https:\/\/[^\s]{3,200}$/i;

// Legt die gelesenen Stammdaten der nuLiga-Vereinsseite am Verein ab (liga_verein). Nur was die Seite wirklich zeigt wird gesetzt:
// ein fehlender Wert (z.B. Parser findet etwas nicht) überschreibt NIE einen vorhandenen. Nur Whitelist-Felder, nie Kontaktdaten.
export async function speichereStammdaten(db: LigaDb, ligaVereinId: string, info: VereinsInfo, jetzt = new Date()) {
  const set: Partial<typeof ligaVereine.$inferInsert> = { stammdatenGelesenAm: jetzt };
  if (info.nummer && /^\d{3,7}$/.test(info.nummer)) set.vereinsnummer = info.nummer;
  if (info.gruendung && info.gruendung >= 1800 && info.gruendung <= jetzt.getFullYear()) set.gruendungsjahr = info.gruendung;
  if (info.website && URL_OK.test(info.website)) set.website = info.website;
  if (info.stammvereine.length > 0) set.stammvereine = info.stammvereine.map((n) => n.slice(0, 120)).slice(0, 20).join("\n");
  await db.update(ligaVereine).set(set).where(eq(ligaVereine.id, ligaVereinId));
  return set;
}
