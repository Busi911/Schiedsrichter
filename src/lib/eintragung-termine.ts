import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import type { RollenGruppe } from "@/components/mehrfachauswahl";
import { mannschaften, termine, terminZuordnungen, users, type vereine } from "@/db/schema";
import { berechneBesetzung } from "@/lib/besetzung";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { formatDatumZeit, formatWochentagDatum } from "@/lib/format";
import { tagKey } from "@/lib/kalender";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { ORDNER_ROLLE_LABEL, ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { rundenspielTypLabel } from "@/lib/termin-label";

// Daten für die EINE öffentliche Eintragungsseite (/eintragen/[token]): Zeitnehmer/Sekretär und Ordner/Kioskdienst/Kassierer in einer Liste.
// Welche Gruppen angeboten werden, entscheidet allein die Freischaltung der jeweiligen Warte (Token am Verein gesetzt) — die Gruppen
// laden unabhängig voneinander und werden je Termin zusammengeführt.

export const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;
const ZEITNEHMER_ROLLE_LABEL: Record<(typeof ZEITNEHMER_ROLLEN)[number], string> = { zeitnehmer: "Zeitnehmer", sekretaer: "Sekretär" };

// Rollen, die sich diese Seite zu einer Gruppe in der Auswahl zusammenfasst ("Zeitnehmer und Sekretär sind eigentlich das Gleiche, nur eine
// andere Aufgabe"): die Person wählt die Gruppe, die konkrete Aufgabe je Termin.

export const ZEITNEHMER_GRUPPE: RollenGruppe = {
  id: "zeitnehmer-sekretaer",
  label: "Zeitnehmer / Sekretär",
  rollen: ZEITNEHMER_ROLLEN.map((r) => ({ value: r, label: ZEITNEHMER_ROLLE_LABEL[r] })),
};
export const ORDNER_GRUPPEN: RollenGruppe[] = ORDNER_ROLLEN.map((r) => ({
  id: r,
  label: ORDNER_ROLLE_LABEL[r],
  rollen: [{ value: r, label: ORDNER_ROLLE_LABEL[r] }],
}));

export function rollenGruppenFuer(aktiv: { zeitnehmer: boolean; ordner: boolean }): RollenGruppe[] {
  return [...(aktiv.zeitnehmer ? [ZEITNEHMER_GRUPPE] : []), ...(aktiv.ordner ? ORDNER_GRUPPEN : [])];
}

export type EintragungTermin = {
  id: string;
  mannschaftId: string | null;
  zeit: string;
  tag: string;
  tagLabel: string;
  typLabel: string;
  ort: string | null;
  beschreibung: string | null;
  vollstaendig: boolean;
  eintragbar: boolean;
  // Rollen, für die der Verein bei DIESEM Termin überhaupt Bedarf hat / für die noch Plätze frei sind.
  rollenMitBedarf: string[];
  offeneRollen: string[];
  zuordnungen: { id: string; label: string }[];
};

const ZEITNEHMER_TYPEN = ["testspiel", "turnier_spiel", "rundenspiel"];
// Ordner-/Kiosk-/Kassierer-Bedarf gilt für den Turnier-CONTAINER selbst (typ = turnier), nicht für dessen Einzelspiele — siehe lib/ordnerwart.ts.
const ORDNER_TYPEN = ["testspiel", "turnier", "rundenspiel"];
const TYP_LABEL: Record<string, string> = { testspiel: "Freundschaftsspiel", turnier_spiel: "Turnierspiel", turnier: "Turnier", rundenspiel: "Rundenspiel" };

type Verein = typeof vereine.$inferSelect;

export async function ladeEintragungsTermine(verein: Verein, aktiv: { zeitnehmer: boolean; ordner: boolean }) {
  return withTenant(verein.id, async (tx) => {
    const alleMannschaften = sortiereMannschaften(await tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, verein.id) }));
    const mannschaftenNachId = new Map(alleMannschaften.map((m) => [m.id, m]));
    const terminListe = await tx.query.termine.findMany({
      where: and(eq(termine.vereinId, verein.id), gte(termine.start, new Date())),
      orderBy: (t, { asc }) => [asc(t.start)],
    });

    const relevantTypen = new Set([...(aktiv.zeitnehmer ? ZEITNEHMER_TYPEN : []), ...(aktiv.ordner ? ORDNER_TYPEN : [])]);
    const relevante = terminListe.filter((t) => relevantTypen.has(t.typ));
    const terminIds = relevante.map((t) => t.id);
    const rollenFilter = [...(aktiv.zeitnehmer ? ZEITNEHMER_ROLLEN : []), ...(aktiv.ordner ? ORDNER_ROLLEN : [])];
    const zuordnungen =
      terminIds.length && rollenFilter.length
        ? await tx
            .select({
              id: terminZuordnungen.id,
              terminId: terminZuordnungen.terminId,
              funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
              name: users.name,
              externerName: terminZuordnungen.externerName,
            })
            .from(terminZuordnungen)
            .leftJoin(users, eq(terminZuordnungen.userId, users.id))
            // Nur die hier angebotenen Rollen — sonst würden z.B. Schiedsrichter-Zuordnungen desselben Termins fälschlich gelabelt mitgeladen.
            .where(and(inArray(terminZuordnungen.terminId, terminIds), inArray(terminZuordnungen.funktionstraegerTyp, rollenFilter)))
        : [];

    const ergebnis: EintragungTermin[] = [];
    for (const t of relevante) {
      const eigene = zuordnungen.filter((z) => z.terminId === t.id);
      const mannschaft = t.mannschaftId ? mannschaftenNachId.get(t.mannschaftId) : null;
      const rollenMitBedarf: string[] = [];
      const offeneRollen: string[] = [];
      let erfuellt = true; // "Besetzung vollständig" = Mindestbedarf aller angebotenen Gruppen erreicht (nicht: alle Plätze voll)

      if (aktiv.zeitnehmer && ZEITNEHMER_TYPEN.includes(t.typ)) {
        const bedarf = bedarfFuer(
          verein,
          t.typ,
          "zeitnehmer",
          t.pflichtspiel,
          t.freundschaftsTyp,
          t.zeitnehmerBedarfOverride,
          mannschaftBedarfDeaktiviertFuer(mannschaft, "zeitnehmer")
        );
        if (bedarf > 0) {
          const besetzung = berechneBesetzung(
            eigene.filter((z) => (ZEITNEHMER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)),
            false,
            bedarf
          );
          rollenMitBedarf.push(...ZEITNEHMER_ROLLEN);
          erfuellt &&= besetzung.zeitnehmerSekretaerErfuellt;
          if (!besetzung.zeitnehmerVoll) offeneRollen.push("zeitnehmer");
          if (!besetzung.sekretaerVoll) offeneRollen.push("sekretaer");
        }
      }

      if (aktiv.ordner && ORDNER_TYPEN.includes(t.typ)) {
        for (const rolle of ORDNER_ROLLEN) {
          const bedarf = bedarfFuer(verein, t.typ, rolle, t.pflichtspiel, t.freundschaftsTyp, undefined, mannschaftBedarfDeaktiviertFuer(mannschaft, rolle));
          if (bedarf <= 0) continue;
          rollenMitBedarf.push(rolle);
          const vorhanden = eigene.filter((z) => z.funktionstraegerTyp === rolle).length;
          if (vorhanden < bedarf) {
            offeneRollen.push(rolle);
            erfuellt = false;
          }
        }
      }

      // Ohne jeden Bedarf (z.B. Freundschaftsspiele, für die der Verein nichts braucht) bleibt der Termin unsichtbar und nicht eintragbar.
      if (rollenMitBedarf.length === 0) continue;

      const rollenLabel = (typ: string) =>
        (ZEITNEHMER_ROLLE_LABEL as Record<string, string>)[typ] ?? (ORDNER_ROLLE_LABEL as Record<string, string>)[typ] ?? typ;
      ergebnis.push({
        id: t.id,
        mannschaftId: t.mannschaftId,
        zeit: formatDatumZeit(t.start),
        tag: tagKey(t.start),
        tagLabel: formatWochentagDatum(t.start),
        typLabel: t.typ === "rundenspiel" ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp) : (TYP_LABEL[t.typ] ?? t.typ),
        ort: t.ort,
        beschreibung: t.beschreibung,
        vollstaendig: erfuellt,
        eintragbar: offeneRollen.length > 0,
        rollenMitBedarf,
        offeneRollen,
        zuordnungen: eigene.map((z) => ({ id: z.id, label: `${rollenLabel(z.funktionstraegerTyp)}: ${z.name ?? z.externerName ?? "—"}` })),
      });
    }
    return { alleMannschaften, termine: ergebnis };
  });
}
