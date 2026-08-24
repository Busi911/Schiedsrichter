import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mannschaften, vereine } from "@/db/schema";
import {
  findeMannschaft,
  parseRundenspielJson,
  type RundenspielEreignis,
} from "./rundenspiel-import";
import {
  entferneVerwaisteRundenspiele,
  importiereRundenspielEreignisse,
  type RundenspielAenderung,
} from "./rundenspiel-sync";
import { holeHandballNetJson, type HandballNetDiagnose } from "./handball-net-scraper";
import { sendeRundenspielAenderungenBenachrichtigung } from "./rundenspiel-benachrichtigung";
import { sendeDuplikatBenachrichtigungen } from "./duplikat-benachrichtigung";

// Ab der 3. Liga läuft der Spielbetrieb über handball.net statt über nuLiga
// (siehe handball-net-scraper.ts) — Sync-Logik analog zu
// synchronisiereNuligaHallen/synchronisiereAlleAktivenNuligaVereine
// (rundenspiel-sync.ts), aber pro MANNSCHAFT (Team-ID) statt pro Verein
// (Hallen-IDs), da handball.net keine "alle Spiele an dieser Halle"-Abfrage
// kennt.

// Die abgefragte team_id steckt als erstes Segment in der UID (siehe
// bildeUid in rundenspiel-import.ts sowie locationId-Aufbau in
// handball-net-scraper.ts: "rundenspiel:{teamId}:..."). Daraus lässt sich
// die Mannschaft nach dem parseRundenspielJson-Durchlauf direkt (statt über
// die namensbasierte Heuristik findeMannschaft) wieder zuordnen.
function teamIdAusUid(uid: string): string | null {
  const match = uid.match(/^rundenspiel:([^:]+):/);
  return match ? match[1] : null;
}

export type HandballNetSyncErgebnis = {
  neu: number;
  aktualisiert: number;
  entfernt: number;
  aenderungen: RundenspielAenderung[];
  parseFehler: { index: number; grund: string }[];
  abrufFehler: { teamId: string; grund: string }[];
  diagnose: HandballNetDiagnose[];
};

export async function synchronisiereHandballNetMannschaften(
  vereinId: string,
  mannschaftenMitTeamId: { id: string; handballNetTeamId: string }[]
): Promise<HandballNetSyncErgebnis> {
  if (mannschaftenMitTeamId.length === 0) {
    return {
      neu: 0,
      aktualisiert: 0,
      entfernt: 0,
      aenderungen: [],
      parseFehler: [],
      abrufFehler: [],
      diagnose: [],
    };
  }

  const mannschaftIdByTeamId = new Map(
    mannschaftenMitTeamId.map((m) => [m.handballNetTeamId, m.id])
  );
  const teamIds = mannschaftenMitTeamId.map((m) => m.handballNetTeamId);

  const { json, fehler: abrufFehler, diagnose } = await holeHandballNetJson(teamIds);
  const { ereignisse, fehler: parseFehler } = parseRundenspielJson(json);

  // Direkte Zuordnung über die bekannte Team-ID; nur zur Sicherheit (z.B.
  // falls sich das UID-Format einmal ändert) Fallback auf die generische
  // namensbasierte Heuristik.
  const mannschaftIdErmitteln = (
    ereignis: RundenspielEreignis,
    mannschaftsListe: { id: string; name: string; altersklasse?: string | null }[]
  ): string | null => {
    const teamId = teamIdAusUid(ereignis.uid);
    const bekannt = teamId ? mannschaftIdByTeamId.get(teamId) : undefined;
    return bekannt ?? findeMannschaft(ereignis, mannschaftsListe);
  };

  const { neu, aktualisiert, aenderungen } = await importiereRundenspielEreignisse(
    vereinId,
    ereignisse,
    mannschaftIdErmitteln
  );
  const entfernt = await entferneVerwaisteRundenspiele(
    vereinId,
    teamIds,
    new Set(ereignisse.map((e) => e.uid))
  );

  return { neu, aktualisiert, entfernt, aenderungen, parseFehler, abrufFehler, diagnose };
}

// Für alle Mannschaften mit gepflegter handball.net-Team-ID, vereinsweise
// gruppiert (siehe /api/cron/rundenspiel-sync) — dieselben Best-effort-
// Benachrichtigungen wie beim nuLiga-Sync (verlegte Spiele/neue Ergebnisse,
// neue Duplikate), da beide Quellen dieselben "rundenspiel"-Termine anlegen.
export async function synchronisiereAlleAktivenHandballNetMannschaften() {
  const alle = await adminDb.query.mannschaften.findMany({
    where: isNotNull(mannschaften.handballNetTeamId),
  });

  const nachVerein = new Map<string, { id: string; handballNetTeamId: string }[]>();
  for (const m of alle) {
    if (!m.handballNetTeamId) continue;
    const liste = nachVerein.get(m.vereinId) ?? [];
    liste.push({ id: m.id, handballNetTeamId: m.handballNetTeamId });
    nachVerein.set(m.vereinId, liste);
  }

  const ergebnisse = [];
  for (const [vereinId, liste] of nachVerein) {
    try {
      const ergebnis = await synchronisiereHandballNetMannschaften(vereinId, liste);
      ergebnisse.push({ vereinId, status: "ok", ...ergebnis });

      try {
        const verein = await adminDb.query.vereine.findFirst({
          where: eq(vereine.id, vereinId),
        });
        if (verein) {
          await sendeRundenspielAenderungenBenachrichtigung(verein, ergebnis.aenderungen);
        }
      } catch {
        // ignoriert — der Sync selbst war bereits erfolgreich.
      }

      try {
        await sendeDuplikatBenachrichtigungen(vereinId);
      } catch {
        // ignoriert — der Sync selbst war bereits erfolgreich.
      }
    } catch (err) {
      ergebnisse.push({
        vereinId,
        status: "fehler",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ergebnisse;
}
