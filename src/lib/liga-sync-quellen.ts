import { eq } from "drizzle-orm";
import { ligaVereine } from "@/db/schema";
import type { HoleJson } from "@/lib/handball-net/client";
import { hatHandballNetQuelle, synchronisiereHandballNet } from "@/lib/handball-net/sync";
import { synchronisiereFreundschaftsspieleSicher, synchronisiereVollstaendig, type HoleHtml, type LigaDb } from "@/lib/nuliga/sync";

export type QuellenSyncErgebnis = {
  status: "erfolgreich" | "teilweise" | "fehler";
  neu: number;
  anfragen: number;
  meldungen: string[];
  unvollstaendig: boolean;
};

// Synchronisiert alle Quellen eines Vereins (nuLiga, handball.net) — jede
// unabhängig: der Ausfall oder Fehler einer Quelle verhindert die andere nicht.
export async function synchronisiereAlleQuellen(
  ligaVereinId: string,
  opt: { db: LigaDb; holeHtml: HoleHtml; holeJson: HoleJson; frist?: number; jetzt?: Date }
): Promise<QuellenSyncErgebnis> {
  const verein = await opt.db.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, ligaVereinId) });
  if (!verein) throw new Error("Liga-Verein nicht gefunden");

  const ergebnis: QuellenSyncErgebnis = {
    status: "erfolgreich",
    neu: 0,
    anfragen: 0,
    meldungen: [],
    unvollstaendig: false,
  };
  const stati: string[] = [];

  if (verein.nuligaClubId) {
    try {
      const { struktur, spiele, freundschaft } = await synchronisiereVollstaendig(ligaVereinId, { ...opt, ohneFreundschaft: true });
      for (const r of [struktur, spiele, freundschaft]) {
        if (!r) continue;
        ergebnis.neu += r.neu;
        ergebnis.anfragen += r.anfragen;
        ergebnis.meldungen.push(...r.meldungen);
        ergebnis.unvollstaendig ||= r.unvollstaendig;
        stati.push(r.status);
      }
      if (!spiele) stati.push("fehler");
    } catch (err) {
      stati.push("fehler");
      ergebnis.meldungen.push(`nuLiga: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (await hatHandballNetQuelle(opt.db, verein)) {
    try {
      const r = await synchronisiereHandballNet(ligaVereinId, opt);
      ergebnis.neu += r.neu;
      ergebnis.anfragen += r.anfragen;
      ergebnis.meldungen.push(...r.meldungen);
      ergebnis.unvollstaendig ||= r.unvollstaendig;
      stati.push(r.status);
    } catch (err) {
      stati.push("fehler");
      ergebnis.meldungen.push(`handball.net: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Freundschaftsspiele zuletzt: bei knappem Zeitbudget kommen so Struktur,
  // Spiele und handball.net zuerst dran.
  if (verein.nuligaClubId && ergebnis.status !== "fehler") {
    const r = await synchronisiereFreundschaftsspieleSicher(ligaVereinId, opt);
    ergebnis.neu += r.neu;
    ergebnis.anfragen += r.anfragen;
    ergebnis.meldungen.push(...r.meldungen);
    ergebnis.unvollstaendig ||= r.unvollstaendig;
    stati.push(r.status);
  }

  // "fehler" nur, wenn ALLE Quellen scheiterten; sonst bei Teilproblemen "teilweise".
  if (stati.length > 0 && stati.every((s) => s === "fehler")) ergebnis.status = "fehler";
  else if (stati.some((s) => s !== "erfolgreich") || ergebnis.unvollstaendig) ergebnis.status = "teilweise";
  return ergebnis;
}
