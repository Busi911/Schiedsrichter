import "server-only";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { berechneBesetzung, istBesetzungVollstaendig } from "@/lib/besetzung";
import { bedarfFuer } from "@/lib/dienste";
import { formatMannschaft } from "@/lib/dashboard";
import { tagKey } from "@/lib/kalender";
import { formatZeit } from "@/lib/format";
import { formatErgebnis, rundenspielTypLabel } from "@/lib/termin-label";
import type { KalenderEintrag } from "@/components/monats-kalender";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

const BESETZUNGSRELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
];

// Termine, bei denen die Person als Schiedsrichter (ICS-Feed), Zeitnehmer/
// Sekretär/Ordner/Kioskdienst (Zuordnung) oder Trainer (eigene Mannschaft)
// beteiligt ist — für den in /profil eingebetteten Kalender (ehemals eigene
// Seite /profil/kalender, jetzt hier direkt integriert).
export async function holeEigeneKalenderEintraege(
  vereinId: string,
  userId: string,
  von: Date,
  bis: Date
): Promise<Map<string, KalenderEintrag[]>> {
  const [termineDesMonats, alleZuordnungen, verein] = await withTenant(
    vereinId,
    async (tx) => {
      const eigeneRollen = await tx.query.funktionstraegerRollen.findMany({
        where: eq(funktionstraegerRollen.userId, userId),
      });
      const mannschaftIds = eigeneRollen
        .filter((r) => r.typ === "trainer" && r.mannschaftId)
        .map((r) => r.mannschaftId!);

      const eigeneZuordnungen = await tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.userId, userId),
      });
      const zugeordneteTerminIds = eigeneZuordnungen.map((z) => z.terminId);

      const bedingungen = [eq(termine.icsSchiedsrichterId, userId)];
      if (zugeordneteTerminIds.length) {
        bedingungen.push(inArray(termine.id, zugeordneteTerminIds));
      }
      if (mannschaftIds.length) {
        bedingungen.push(inArray(termine.mannschaftId, mannschaftIds));
      }

      const termineDesMonats = await tx
        .select({
          id: termine.id,
          typ: termine.typ,
          start: termine.start,
          ort: termine.ort,
          beschreibung: termine.beschreibung,
          pflichtspiel: termine.pflichtspiel,
          freundschaftsTyp: termine.freundschaftsTyp,
          hatIcsSchiedsrichter: termine.icsSchiedsrichterId,
          ergebnisHeim: termine.ergebnisHeim,
          ergebnisAuswaerts: termine.ergebnisAuswaerts,
          mannschaftName: mannschaften.name,
          mannschaftAltersklasse: mannschaften.altersklasse,
          kategorie: termine.kategorie,
          zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
        })
        .from(termine)
        .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
        .where(
          and(
            eq(termine.vereinId, vereinId),
            gte(termine.start, von),
            lte(termine.start, bis),
            or(...bedingungen)
          )
        )
        .orderBy(asc(termine.start));

      const terminIds = termineDesMonats.map((t) => t.id);
      const alleZuordnungen = terminIds.length
        ? await tx
            .select({
              terminId: terminZuordnungen.terminId,
              funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
              name: users.name,
              email: users.email,
              externerName: terminZuordnungen.externerName,
            })
            .from(terminZuordnungen)
            .leftJoin(users, eq(terminZuordnungen.userId, users.id))
            .where(inArray(terminZuordnungen.terminId, terminIds))
        : [];

      const verein = await tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
      });

      return [termineDesMonats, alleZuordnungen, verein] as const;
    }
  );

  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  for (const t of termineDesMonats) {
    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const eigeneZuordnungen = alleZuordnungen.filter((z) => z.terminId === t.id);
    const besetzung =
      BESETZUNGSRELEVANTE_TYPEN.includes(t.typ) && verein
        ? istBesetzungVollstaendig(
            berechneBesetzung(
              eigeneZuordnungen,
              !!t.hatIcsSchiedsrichter,
              bedarfFuer(
                verein,
                t.typ,
                "zeitnehmer",
                t.pflichtspiel,
                t.freundschaftsTyp,
                t.zeitnehmerBedarfOverride
              ),
              verein.zeitnehmerSekretaerMax
            ),
            t.typ,
            t.pflichtspiel
          )
          ? ("vollstaendig" as const)
          : ("offen" as const)
        : undefined;
    // Rein informativ (kein Zuordnen/Entfernen für den Funktionsträger
    // selbst) — synthetische id genügt, da monats-kalender Entfernen-Buttons
    // ohnehin nur bei zuordenbar=true anzeigt.
    const besetzungsDetails = eigeneZuordnungen.map((z, i) => ({
      id: `${t.id}-${i}`,
      label: `${ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${
        z.name ?? z.externerName ?? z.email
      }${z.externerName && !z.email ? " (ohne Login)" : ""}`,
    }));
    const typLabel =
      t.typ === "rundenspiel"
        ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
        : TYP_LABEL[t.typ] ?? t.typ;
    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label: t.beschreibung ?? t.ort ?? typLabel,
      typLabel,
      besetzung,
      ort: t.ort,
      besetzungsDetails,
      mannschaftLabel: formatMannschaft(t),
      ergebnis: formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts),
    });
    eintraegeProTag.set(key, liste);
  }

  return eintraegeProTag;
}
