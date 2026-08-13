import "server-only";
import { async as icalAsync } from "node-ical";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { icsSyncLog, schiedsrichterProfile, termine } from "@/db/schema";
import { istSaisonAbgeschlossen } from "./saison";

// Viele Kalendersysteme (u.a. nuLiga, von zahlreichen Sportverbänden
// genutzt) geben Abo-Links mit dem "webcal://"-Schema aus. Das ist nur eine
// Konvention für "im Kalenderprogramm öffnen" — inhaltlich identisch zu
// https://. fetch() kennt das Schema nicht, daher hier normalisieren.
export function normalisiereFeedUrl(url: string): string {
  if (url.startsWith("webcal://")) {
    return "https://" + url.slice("webcal://".length);
  }
  if (url.startsWith("webcals://")) {
    return "https://" + url.slice("webcals://".length);
  }
  return url;
}

export function textValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "val" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).val);
  }
  return String(v);
}

/**
 * Ruft den vom Schiedsrichter hinterlegten ICS-Feed ab und gleicht ihn mit
 * den vorhandenen 'spiel_ics'-Terminen ab (Match über die ICS-UID). Läuft
 * innerhalb des Tenant-Kontexts des Schiedsrichters (RLS-konform).
 */
export async function syncSchiedsrichterIcsFeed(
  vereinId: string,
  userId: string
) {
  return withTenant(vereinId, async (tx) => {
    const profil = await tx.query.schiedsrichterProfile.findFirst({
      where: eq(schiedsrichterProfile.userId, userId),
    });
    if (!profil?.icsFeedUrl) {
      throw new Error("Keine ICS-Feed-URL hinterlegt.");
    }

    let neu = 0;
    let aktualisiert = 0;
    let entfernt = 0;
    let status: "erfolgreich" | "fehler" = "erfolgreich";
    let fehlermeldung: string | null = null;

    try {
      const events = await icalAsync.fromURL(
        normalisiereFeedUrl(profil.icsFeedUrl)
      );

      const vorhandene = await tx.query.termine.findMany({
        where: and(
          eq(termine.icsSchiedsrichterId, userId),
          eq(termine.vereinId, vereinId)
        ),
      });
      const vorhandeneByUid = new Map(
        vorhandene.filter((t) => t.icsUid).map((t) => [t.icsUid as string, t])
      );
      const gesehenUids = new Set<string>();

      for (const key of Object.keys(events)) {
        const event = events[key];
        if (!event || event.type !== "VEVENT" || !event.start) continue;

        const uid = event.uid ?? key;
        gesehenUids.add(uid);

        const werte = {
          start: new Date(event.start),
          ende: event.end ? new Date(event.end) : null,
          ort: textValue(event.location),
          beschreibung: textValue(event.summary),
        };

        const bestehend = vorhandeneByUid.get(uid);
        if (bestehend) {
          // Festgeschriebene (abgeschlossene) Saisons bleiben unangetastet,
          // selbst wenn der Feed für dieses Datum abweichende Werte liefert.
          if (istSaisonAbgeschlossen(bestehend.start)) continue;
          await tx
            .update(termine)
            .set(werte)
            .where(eq(termine.id, bestehend.id));
          aktualisiert++;
        } else {
          await tx.insert(termine).values({
            vereinId,
            typ: "spiel_ics",
            quelle: "ics_feed",
            icsUid: uid,
            icsSchiedsrichterId: userId,
            ...werte,
          });
          neu++;
        }
      }

      // Termine, die nicht mehr im Feed enthalten sind (z.B. Absagen), entfernen —
      // ABER nur innerhalb der laufenden, noch nicht festgeschriebenen
      // Saison. Viele Verbands-Feeds (nuLiga u.a.) zeigen ohnehin nur die
      // laufende Saison; mit Saisonwechsel verschwinden dort einfach alte
      // Spiele aus dem Feed, ohne dass real etwas abgesagt wurde. Ohne diese
      // Festschreibung würde jeder Saisonwechsel (oder eine geänderte
      // Feed-URL) die komplette Vergangenheit löschen — das wäre kein
      // "Verlauf" mehr.
      for (const t of vorhandene) {
        if (
          t.icsUid &&
          !gesehenUids.has(t.icsUid) &&
          !istSaisonAbgeschlossen(t.start)
        ) {
          await tx.delete(termine).where(eq(termine.id, t.id));
          entfernt++;
        }
      }
    } catch (err) {
      status = "fehler";
      fehlermeldung = err instanceof Error ? err.message : String(err);
    }

    await tx
      .update(schiedsrichterProfile)
      .set({ letzterSyncAm: new Date(), letzterSyncStatus: status })
      .where(eq(schiedsrichterProfile.userId, userId));

    await tx.insert(icsSyncLog).values({
      schiedsrichterId: userId,
      neuCount: neu,
      aktualisiertCount: aktualisiert,
      entferntCount: entfernt,
      status,
      fehlermeldung,
    });

    if (status === "fehler") {
      throw new Error(fehlermeldung ?? "Synchronisierung fehlgeschlagen.");
    }
    return { neu, aktualisiert, entfernt };
  });
}
