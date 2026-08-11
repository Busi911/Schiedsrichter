import "server-only";
import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, zuschuesse } from "@/db/schema";

const ABRECHENBARE_TYPEN = ["schiedsrichter", "zeitnehmer", "sekretaer"] as const;

export type OffenerEinsatz = {
  terminId: string;
  userId: string;
  funktionstraegerTyp: string;
  terminStart: Date;
  terminBeschreibung: string | null;
  personName: string | null;
  personEmail: string;
};

/**
 * Vergangene Einsätze (Schiedsrichter/Zeitnehmer/Sekretär), für die noch
 * kein Zuschuss angelegt wurde. Kombiniert termin_zuordnung (manuell
 * zugeordnet) mit termin.ics_schiedsrichter_id (automatisch aus dem
 * ICS-Feed), da beide Quellen "wer war im Einsatz" abbilden.
 */
export async function holeOffeneEinsaetze(
  vereinId: string
): Promise<OffenerEinsatz[]> {
  return withTenant(vereinId, async (tx) => {
    const jetzt = new Date();

    const ausZuordnung = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        userId: terminZuordnungen.userId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
        terminStart: termine.start,
        terminBeschreibung: termine.beschreibung,
        personName: users.name,
        personEmail: users.email,
      })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .innerJoin(users, eq(terminZuordnungen.userId, users.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          lt(termine.start, jetzt),
          inArray(terminZuordnungen.funktionstraegerTyp, [...ABRECHENBARE_TYPEN])
        )
      );

    const ausIcsFeed = await tx
      .select({
        terminId: termine.id,
        userId: termine.icsSchiedsrichterId,
        terminStart: termine.start,
        terminBeschreibung: termine.beschreibung,
        personName: users.name,
        personEmail: users.email,
      })
      .from(termine)
      .innerJoin(users, eq(termine.icsSchiedsrichterId, users.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          lt(termine.start, jetzt),
          isNotNull(termine.icsSchiedsrichterId)
        )
      );

    const bestehendeZuschuesse = await tx
      .select({ terminId: zuschuesse.terminId, userId: zuschuesse.userId })
      .from(zuschuesse)
      .innerJoin(termine, eq(zuschuesse.terminId, termine.id))
      .where(eq(termine.vereinId, vereinId));
    const bereitsAbgerechnet = new Set(
      bestehendeZuschuesse.map((z) => `${z.terminId}:${z.userId}`)
    );

    const alle = new Map<string, OffenerEinsatz>();
    for (const e of ausZuordnung) {
      alle.set(`${e.terminId}:${e.userId}:${e.funktionstraegerTyp}`, e);
    }
    for (const e of ausIcsFeed) {
      if (!e.userId) continue;
      alle.set(`${e.terminId}:${e.userId}:schiedsrichter`, {
        ...e,
        userId: e.userId,
        funktionstraegerTyp: "schiedsrichter",
      });
    }

    return [...alle.values()]
      .filter((e) => !bereitsAbgerechnet.has(`${e.terminId}:${e.userId}`))
      .sort((a, b) => b.terminStart.getTime() - a.terminStart.getTime());
  });
}

export async function holeZuschuesse(vereinId: string) {
  return withTenant(vereinId, (tx) =>
    tx
      .select({
        id: zuschuesse.id,
        terminId: zuschuesse.terminId,
        userId: zuschuesse.userId,
        satz: zuschuesse.satz,
        berechneterBetrag: zuschuesse.berechneterBetrag,
        status: zuschuesse.status,
        terminStart: termine.start,
        terminBeschreibung: termine.beschreibung,
        personName: users.name,
        personEmail: users.email,
      })
      .from(zuschuesse)
      .innerJoin(termine, eq(zuschuesse.terminId, termine.id))
      .innerJoin(users, eq(zuschuesse.userId, users.id))
      .where(eq(termine.vereinId, vereinId))
      .orderBy(desc(termine.start))
  );
}

export function zuschuesseAlsCsv(
  zeilen: Awaited<ReturnType<typeof holeZuschuesse>>
) {
  const kopf = [
    "Datum",
    "Beschreibung",
    "Person",
    "E-Mail",
    "Satz",
    "Betrag",
    "Status",
  ];

  function csvFeld(wert: unknown) {
    const text = wert == null ? "" : String(wert);
    if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  const zeilenText = zeilen.map((z) =>
    [
      z.terminStart.toLocaleDateString("de-DE"),
      z.terminBeschreibung,
      z.personName,
      z.personEmail,
      z.satz,
      z.berechneterBetrag,
      z.status,
    ]
      .map(csvFeld)
      .join(";")
  );

  return "﻿" + [kopf.join(";"), ...zeilenText].join("\n");
}
