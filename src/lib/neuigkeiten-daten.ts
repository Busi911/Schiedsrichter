import "server-only";
import { and, count, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { neuigkeiten, vereine } from "@/db/schema";
import { FeedFehler, parseFeed } from "@/lib/neuigkeiten";
import { holeFeedText } from "@/lib/neuigkeiten-abruf";

// Neuigkeiten aus dem abonnierten Feed der Vereinshomepage (Schalter vereine.neuigkeiten_aktiv, siehe lib/neuigkeiten.ts).

export async function neuigkeitenZaehlen(vereinId: string): Promise<number> {
  const [z] = await withTenant(vereinId, (tx) => tx.select({ n: count() }).from(neuigkeiten).where(eq(neuigkeiten.vereinId, vereinId)));
  return z?.n ?? 0;
}

// ---- Abruf (Cron und Einstellungen; adminDb mit ausdrücklichem verein_id) ----

export type AbrufErgebnis = { ok: true; anzahl: number } | { ok: false; fehler: string };

/**
 * Ruft den Feed des Vereins ab und gleicht die gespeicherten Einträge ab: neue kommen dazu, vorhandene werden aktualisiert (das Datum
 * nur, wenn der Feed eines nennt), nicht mehr enthaltene verschwinden — aber nur, wenn der Feed lesbar war UND Einträge enthielt
 * (ein Fehler oder ein leerer Feed löscht nie). Der Fehler wird am Verein vermerkt und in den Einstellungen angezeigt.
 */
export async function aktualisiereNeuigkeiten(vereinId: string): Promise<AbrufErgebnis> {
  const [v] = await adminDb
    .select({ aktiv: vereine.neuigkeitenAktiv, url: vereine.neuigkeitenFeedUrl })
    .from(vereine)
    .where(eq(vereine.id, vereinId));
  if (!v?.aktiv || !v.url) return { ok: false, fehler: "Neuigkeiten sind nicht eingeschaltet oder es fehlt die Feed-Adresse." };

  try {
    const eintraege = parseFeed(await holeFeedText(v.url));
    const jetzt = new Date();
    await adminDb.transaction(async (tx) => {
      for (const e of eintraege) {
        await tx
          .insert(neuigkeiten)
          .values({ vereinId, guid: e.guid, titel: e.titel, auszug: e.auszug, link: e.link, veroeffentlichtAm: e.datum ?? jetzt, abgerufenAm: jetzt })
          .onConflictDoUpdate({
            target: [neuigkeiten.vereinId, neuigkeiten.guid],
            set: {
              titel: e.titel,
              auszug: e.auszug,
              link: e.link,
              abgerufenAm: jetzt,
              // Ohne Datum im Feed bleibt das erste Sehen als Datum erhalten.
              ...(e.datum && { veroeffentlichtAm: e.datum }),
            },
          });
      }
      if (eintraege.length > 0) {
        await tx.delete(neuigkeiten).where(and(eq(neuigkeiten.vereinId, vereinId), notInArray(neuigkeiten.guid, eintraege.map((e) => e.guid))));
      }
      await tx.update(vereine).set({ neuigkeitenAbgerufenAm: jetzt, neuigkeitenFehler: null }).where(eq(vereine.id, vereinId));
    });
    return { ok: true, anzahl: eintraege.length };
  } catch (err) {
    // Nur eigene, allgemein formulierte Fehler zeigen; alles andere (z.B. Datenbank) bleibt neutral.
    const fehler = err instanceof FeedFehler ? err.message : "Der Feed konnte nicht gelesen werden.";
    await adminDb.update(vereine).set({ neuigkeitenFehler: fehler }).where(eq(vereine.id, vereinId));
    return { ok: false, fehler };
  }
}

/** Vereine, deren Feed der Cron abrufen soll: aktiv geschaltet, mit Adresse, Verein regulär aktiv; am längsten nicht abgerufene zuerst. */
export async function holeVereineFuerFeedAbruf(limit: number): Promise<string[]> {
  const zeilen = await adminDb
    .select({ id: vereine.id })
    .from(vereine)
    .where(and(eq(vereine.neuigkeitenAktiv, true), isNotNull(vereine.neuigkeitenFeedUrl), eq(vereine.status, "aktiv")))
    .orderBy(sql`${vereine.neuigkeitenAbgerufenAm} asc nulls first`)
    .limit(limit);
  return zeilen.map((z) => z.id);
}

/** Entfernt alle gespeicherten Einträge (z.B. bei einer neuen Feed-Adresse). */
export async function loescheNeuigkeiten(vereinId: string): Promise<void> {
  await adminDb.delete(neuigkeiten).where(eq(neuigkeiten.vereinId, vereinId));
}

// ---- Öffentlich (ohne Anmeldung, über adminDb: der Vereinsfilter steht ausdrücklich in jeder Abfrage) ----

/** Hat der Verein die Neuigkeiten eingeschaltet (und eine Feed-Adresse)? Für Reiter, Sitemap und die Seiten (aus = 404). */
export async function neuigkeitenOeffentlichAktiv(vereinId: string): Promise<boolean> {
  const [v] = await mitColdStartRetry(() =>
    adminDb.select({ aktiv: vereine.neuigkeitenAktiv, url: vereine.neuigkeitenFeedUrl }).from(vereine).where(eq(vereine.id, vereinId))
  );
  return !!v?.aktiv && !!v.url;
}

export async function holeVereineMitNeuigkeiten(): Promise<Set<string>> {
  const zeilen = await mitColdStartRetry(() =>
    adminDb.select({ id: vereine.id }).from(vereine).where(and(eq(vereine.neuigkeitenAktiv, true), isNotNull(vereine.neuigkeitenFeedUrl)))
  );
  return new Set(zeilen.map((z) => z.id));
}

export type OeffentlicheNeuigkeit = { id: string; titel: string; auszug: string | null; link: string; datum: Date };

/** Gespeicherte Neuigkeiten, neueste zuerst; null, wenn der Verein die Funktion nicht eingeschaltet hat. */
export async function holeOeffentlicheNeuigkeiten(vereinId: string, limit = 30): Promise<OeffentlicheNeuigkeit[] | null> {
  if (!(await neuigkeitenOeffentlichAktiv(vereinId))) return null;
  const zeilen = await mitColdStartRetry(() =>
    adminDb
      .select({ id: neuigkeiten.id, titel: neuigkeiten.titel, auszug: neuigkeiten.auszug, link: neuigkeiten.link, datum: neuigkeiten.veroeffentlichtAm })
      .from(neuigkeiten)
      .where(eq(neuigkeiten.vereinId, vereinId))
      .orderBy(desc(neuigkeiten.veroeffentlichtAm))
      .limit(limit)
  );
  return zeilen;
}
