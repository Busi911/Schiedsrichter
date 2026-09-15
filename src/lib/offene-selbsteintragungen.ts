import "server-only";
import {
  holeOrdnerEinsatzZahlen,
  holeOrdnerRelevanteTermine,
  ORDNER_ROLLE_LABEL,
  ORDNER_ROLLEN,
} from "./ordnerwart";
import { holeTermineMitZuordnungen } from "./zuordnung";
import {
  holeInaktiveZeitnehmerKandidaten,
  holeZeitnehmerEinsatzZahlen,
} from "./zeitnehmerwart";
import { findeNamensVorschlag } from "./namens-abgleich";

// Siehe gleichnamige Konstante in lib/zeitnehmerwart.ts — dort (wie an den
// übrigen Stellen im Zeitnehmer-/Sekretär-Bereich) bewusst nicht exportiert,
// hier deshalb dupliziert statt importiert.
const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;
const ZEITNEHMER_ROLLE_LABEL: Record<string, string> = {
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

export type OffeneSelbsteintragung = {
  id: string;
  bereich: "ordner" | "zeitnehmer";
  externerName: string;
  rolleLabel: string;
  matchVorschlagUserId: string | null;
  termin: { start: Date; beschreibung: string | null };
  kandidaten: { value: string; label: string }[];
  // Nur im Zeitnehmer-/Sekretär-Bereich: kein aktiver Namens-Treffer
  // (matchVorschlagUserId), aber ein ähnlicher Name unter den DEAKTIVIERTEN
  // Rollen gefunden — siehe gleiche Logik in profil/zeitnehmerwart/page.tsx.
  inaktivVorschlag: { rolleId: string; name: string | null; email: string } | null;
};

// Führt die "Selbsteintragungen zum Bestätigen"-Listen von
// profil/ordnerwart und profil/zeitnehmerwart zu EINER, nach Termin
// sortierten Liste zusammen — für die Admin-Übersicht, die beide Bereiche
// auf einen Blick zeigt, statt zwischen den beiden Wart-Seiten wechseln zu
// müssen. Schiedsrichter fehlt hier bewusst: die haben keine öffentliche
// Selbsteintragung, kommen nur per nuLiga/handball.net-Import oder direkter
// Admin-Zuordnung zustande.
export async function holeOffeneSelbsteintragungen(
  vereinId: string
): Promise<OffeneSelbsteintragung[]> {
  const [
    ordnerTermine,
    ordnerPersonen,
    zeitnehmerTermine,
    zeitnehmerPersonen,
    inaktiveZeitnehmerKandidaten,
  ] = await Promise.all([
    holeOrdnerRelevanteTermine(vereinId),
    holeOrdnerEinsatzZahlen(vereinId),
    holeTermineMitZuordnungen(vereinId),
    holeZeitnehmerEinsatzZahlen(vereinId),
    holeInaktiveZeitnehmerKandidaten(vereinId),
  ]);

  const ordnerOffene: OffeneSelbsteintragung[] = ordnerTermine.flatMap((t) =>
    t.zuordnungen
      .filter(
        (z) =>
          z.quelle === "selbst_eingetragen_oeffentlich" &&
          !z.userId &&
          (ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)
      )
      .map((z) => {
        const rolle = z.funktionstraegerTyp as (typeof ORDNER_ROLLEN)[number];
        return {
          id: z.id,
          bereich: "ordner" as const,
          externerName: z.externerName ?? "",
          rolleLabel: ORDNER_ROLLE_LABEL[rolle] ?? rolle,
          matchVorschlagUserId: z.matchVorschlagUserId,
          termin: { start: t.start, beschreibung: t.beschreibung },
          kandidaten: ordnerPersonen
            .filter((p) => p.rollen.includes(rolle))
            .map((p) => ({ value: p.userId, label: p.name ?? p.email })),
          inaktivVorschlag: null,
        };
      })
  );

  const zeitnehmerOffene: OffeneSelbsteintragung[] = zeitnehmerTermine.flatMap(
    (t) =>
      t.zuordnungen
        .filter(
          (z) =>
            z.quelle === "selbst_eingetragen_oeffentlich" &&
            !z.userId &&
            (ZEITNEHMER_ROLLEN as readonly string[]).includes(
              z.funktionstraegerTyp
            )
        )
        .map((z) => {
          const rolle = z.funktionstraegerTyp as (typeof ZEITNEHMER_ROLLEN)[number];
          const inaktivVorschlag = z.matchVorschlagUserId
            ? null
            : (() => {
                const { exakt, vorschlag } = findeNamensVorschlag(
                  z.externerName ?? "",
                  inaktiveZeitnehmerKandidaten.filter((k) => k.typ === rolle)
                );
                return exakt ?? vorschlag;
              })();
          return {
            id: z.id,
            bereich: "zeitnehmer" as const,
            externerName: z.externerName ?? "",
            rolleLabel: ZEITNEHMER_ROLLE_LABEL[rolle] ?? rolle,
            matchVorschlagUserId: z.matchVorschlagUserId,
            termin: { start: t.start, beschreibung: t.beschreibung },
            kandidaten: zeitnehmerPersonen
              .filter((p) => p.rollen.includes(rolle))
              .map((p) => ({ value: p.userId, label: p.name ?? p.email })),
            inaktivVorschlag: inaktivVorschlag
              ? {
                  rolleId: inaktivVorschlag.rolleId,
                  name: inaktivVorschlag.name,
                  email: inaktivVorschlag.email,
                }
              : null,
          };
        })
  );

  return [...ordnerOffene, ...zeitnehmerOffene].sort(
    (a, b) => a.termin.start.getTime() - b.termin.start.getTime()
  );
}

export type OffeneAbmeldeanfrage = {
  id: string;
  bereich: "ordner" | "zeitnehmer";
  name: string;
  rolleLabel: string;
  termin: { start: Date; beschreibung: string | null };
};

// Analog zu holeOffeneSelbsteintragungen oben, aber für Abmeldeanfragen
// (siehe selbstAbmelden in profil/actions.ts, terminZuordnungen.
// abmeldungAngefragtAm) — führt beide Wart-Bereiche für die Admin-Übersicht
// zusammen, damit ein Admin ohne eigene Wart-Rolle die Anfragen ebenfalls
// sieht (er kann sie dank istAdmin-Bypass auf den Wart-Seiten selbst auch
// bestätigen/ablehnen, siehe abmeldungGenehmigen/abmeldungAblehnen in
// profil/ordnerwart/actions.ts bzw. profil/zeitnehmerwart/actions.ts).
export async function holeOffeneAbmeldeanfragen(
  vereinId: string
): Promise<OffeneAbmeldeanfrage[]> {
  const [ordnerTermine, zeitnehmerTermine] = await Promise.all([
    holeOrdnerRelevanteTermine(vereinId),
    holeTermineMitZuordnungen(vereinId),
  ]);

  const ordnerAnfragen: OffeneAbmeldeanfrage[] = ordnerTermine.flatMap((t) =>
    t.zuordnungen
      .filter(
        (z) =>
          z.abmeldungAngefragtAm != null &&
          (ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)
      )
      .map((z) => ({
        id: z.id,
        bereich: "ordner" as const,
        name: z.name ?? z.externerName ?? "",
        rolleLabel: ORDNER_ROLLE_LABEL[z.funktionstraegerTyp as (typeof ORDNER_ROLLEN)[number]] ??
          z.funktionstraegerTyp,
        termin: { start: t.start, beschreibung: t.beschreibung },
      }))
  );

  const zeitnehmerAnfragen: OffeneAbmeldeanfrage[] = zeitnehmerTermine.flatMap(
    (t) =>
      t.zuordnungen
        .filter(
          (z) =>
            z.abmeldungAngefragtAm != null &&
            (ZEITNEHMER_ROLLEN as readonly string[]).includes(
              z.funktionstraegerTyp
            )
        )
        .map((z) => ({
          id: z.id,
          bereich: "zeitnehmer" as const,
          name: z.name ?? z.externerName ?? "",
          rolleLabel: ZEITNEHMER_ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp,
          termin: { start: t.start, beschreibung: t.beschreibung },
        }))
  );

  return [...ordnerAnfragen, ...zeitnehmerAnfragen].sort(
    (a, b) => a.termin.start.getTime() - b.termin.start.getTime()
  );
}
