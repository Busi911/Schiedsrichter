import "server-only";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, users } from "@/db/schema";
import { formatDatumKurz, formatZeitKurz } from "./format";

export type AuswertungFilter = {
  von?: string;
  bis?: string;
  typ?: string;
  schiedsrichterId?: string;
};

const TERMIN_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier",
  "turnier_spiel",
  "rundenspiel",
] as const;

export async function holeTermineFuerAuswertung(
  vereinId: string,
  filter: AuswertungFilter
) {
  return withTenant(vereinId, (tx) => {
    const bedingungen: SQL[] = [eq(termine.vereinId, vereinId)];

    if (filter.von) bedingungen.push(gte(termine.start, new Date(filter.von)));
    if (filter.bis) bedingungen.push(lte(termine.start, new Date(filter.bis)));
    if (
      filter.typ &&
      (TERMIN_TYPEN as readonly string[]).includes(filter.typ)
    ) {
      bedingungen.push(
        eq(termine.typ, filter.typ as (typeof TERMIN_TYPEN)[number])
      );
    }
    if (filter.schiedsrichterId) {
      bedingungen.push(eq(termine.icsSchiedsrichterId, filter.schiedsrichterId));
    }

    return tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ende: termine.ende,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        mannschaftName: mannschaften.name,
        schiedsrichterName: users.name,
        schiedsrichterEmail: users.email,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .leftJoin(users, eq(termine.icsSchiedsrichterId, users.id))
      .where(and(...bedingungen))
      .orderBy(asc(termine.start));
  });
}

export function terminAlsCsv(
  zeilen: Awaited<ReturnType<typeof holeTermineFuerAuswertung>>
) {
  const kopf = [
    "Datum",
    "Uhrzeit",
    "Typ",
    "Ort",
    "Beschreibung",
    "Mannschaft",
    "Schiedsrichter",
    "Schiedsrichter-E-Mail",
  ];

  function csvFeld(wert: unknown) {
    const text = wert == null ? "" : String(wert);
    if (/[",\n;]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  const zeilenText = zeilen.map((z) =>
    [
      formatDatumKurz(z.start),
      formatZeitKurz(z.start),
      z.typ,
      z.ort,
      z.beschreibung,
      z.mannschaftName,
      z.schiedsrichterName,
      z.schiedsrichterEmail,
    ]
      .map(csvFeld)
      .join(";")
  );

  // BOM, damit Excel unter Windows UTF-8 korrekt erkennt.
  return "﻿" + [kopf.join(";"), ...zeilenText].join("\n");
}
