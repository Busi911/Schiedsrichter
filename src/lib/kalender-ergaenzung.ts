import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, hallen, mannschaften, trainingAusfaelle, trainingBelegungen, trainingszeiten, vereine } from "@/db/schema";
import type { KalenderEintrag } from "@/components/monats-kalender";
import { formatZeit } from "@/lib/format";
import { tagKey } from "@/lib/kalender";
import type { KalenderArt } from "@/lib/kalender-arten";
import { darfTrainingSehen, formatMinuten, trainingsImZeitraum } from "@/lib/training-ausfall";
import { abteilLabel, istInSaison, ortWort } from "@/lib/trainingsplan";
import { ARTEN, type Art } from "@/lib/vereinstermine";
import { holeSichtbareVereinstermine, holeVereinsterminPerson, vereinstermineAktiv } from "@/lib/vereinstermine-daten";
import { istWiederholung, serienText } from "@/lib/wiederholung";

export type KalenderAnsicht = "admin" | "profil";

export type Ergaenzung = {
  eintraege: Map<string, KalenderEintrag[]>;
  // Welche Filter sinnvoll sind (Training: nur wenn die Person Trainings sehen darf; Vereinstermine: nur wenn der Verein sie verwendet).
  verfuegbar: { training: boolean; verein: boolean };
};

// Trainings und Vereinstermine als zusätzliche Einträge für den Kalender (Admin-Kalender und "Mein Kalender"), damit alle Aktivitäten in EINER Ansicht stehen.
// Training: im Admin-Kalender alle; im Profil Admins und (bei eingeschaltetem "Training für alle") jede Person alle, sonst Trainer die ihrer Mannschaften.
// Vereinstermine: nur die, die die Person sehen darf (Sichtbarkeit, siehe lib/vereinstermine.ts).
export async function holeKalenderErgaenzung(p: {
  vereinId: string;
  userId: string;
  istAdmin: boolean;
  istAdminLesend: boolean;
  von: Date;
  bis: Date;
  arten: Set<KalenderArt>;
  ansicht: KalenderAnsicht;
}): Promise<Ergaenzung> {
  const { vereinId, userId, von, bis } = p;
  const eintraege = new Map<string, KalenderEintrag[]>();
  const hinzu = (datum: string, e: KalenderEintrag) => eintraege.set(datum, [...(eintraege.get(datum) ?? []), e]);
  const vonTag = tagKey(von);
  const bisTag = tagKey(bis);
  const istAdminOderLesend = p.istAdmin || p.istAdminLesend;

  const [trainingsDaten, verwendetVereinstermine] = await Promise.all([
    withTenant(vereinId, async (tx) => {
      const [verein, rollen] = await Promise.all([
        tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { trainingFuerAlleSichtbar: true } }),
        tx.query.funktionstraegerRollen.findMany({
          where: and(eq(funktionstraegerRollen.userId, userId), eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)),
          columns: { mannschaftId: true },
        }),
      ]);
      const istTrainer = rollen.length > 0;
      const darf = darfTrainingSehen({
        istAdmin: p.istAdmin,
        istAdminLesend: p.istAdminLesend,
        istTrainer,
        fuerAlleSichtbar: verein?.trainingFuerAlleSichtbar ?? false,
      });
      if (!darf || !p.arten.has("training")) return { darf, zeilen: null };
      const alle = p.ansicht === "admin" || istAdminOderLesend || (verein?.trainingFuerAlleSichtbar ?? false);
      const eigene = new Set(rollen.flatMap((r) => (r.mannschaftId ? [r.mannschaftId] : [])));
      const [zeiten, ausfaelle, belegungen, mannschaftenListe, hallenListe] = await Promise.all([
        tx.query.trainingszeiten.findMany({ where: eq(trainingszeiten.vereinId, vereinId) }),
        tx.query.trainingAusfaelle.findMany({ where: and(eq(trainingAusfaelle.vereinId, vereinId), gte(trainingAusfaelle.datum, vonTag), lte(trainingAusfaelle.datum, bisTag)) }),
        tx.query.trainingBelegungen.findMany({ where: and(eq(trainingBelegungen.vereinId, vereinId), gte(trainingBelegungen.datum, vonTag), lte(trainingBelegungen.datum, bisTag)) }),
        tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId) }),
        tx.query.hallen.findMany({ where: eq(hallen.vereinId, vereinId) }),
      ]);
      return {
        darf,
        zeilen: { zeiten: alle ? zeiten : zeiten.filter((z) => eigene.has(z.mannschaftId)), ausfaelle, belegungen, mannschaftenListe, hallenListe },
      };
    }),
    vereinstermineAktiv(vereinId),
  ]);

  if (trainingsDaten.zeilen) {
    const { zeiten, ausfaelle, belegungen, mannschaftenListe, hallenListe } = trainingsDaten.zeilen;
    const belegt = new Map(belegungen.map((b) => [`${b.trainingszeitId}|${b.datum}`, b]));
    const mannschaft = new Map(mannschaftenListe.map((m) => [m.id, m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name]));
    const halle = new Map(hallenListe.map((h) => [h.id, h]));
    for (const t of trainingsImZeitraum(zeiten, ausfaelle, vonTag, bisTag, (halleId, datum) => {
      const h = halle.get(halleId);
      return !h || istInSaison(h, datum);
    })) {
      const h = halle.get(t.halleId);
      const b = belegt.get(`${t.id}|${t.datum}`);
      const ort = h ? (t.abteilNummer ? `${h.name}, ${abteilLabel(h, t.abteilNummer)}` : h.name) : null;
      hinzu(t.datum, {
        id: `training-${t.id}-${t.datum}`,
        art: "training",
        zeit: formatMinuten(t.startMinuten),
        label: mannschaft.get(t.mannschaftId) ?? "Training",
        typLabel: `Training bis ${formatMinuten(t.endMinuten)} Uhr${t.ausgefallen ? (b ? ` · fällt aus, belegt von ${mannschaft.get(b.mannschaftId) ?? "einer Mannschaft"}` : ` · fällt aus, ${ortWort(h?.art)} frei`) : ""}`,
        ort,
        farbe: t.farbe,
        ausgefallen: t.ausgefallen,
        detailText: [t.grund ? `Grund: ${t.grund}` : null, b?.notiz ? `Belegt: ${b.notiz}` : null].filter(Boolean).join("\n") || undefined,
        detailHref: "/profil/training",
        detailLinkText: t.ausgefallen && !b ? "Zur freien Zeit" : "Zum Training",
      });
    }
  }

  if (verwendetVereinstermine && p.arten.has("verein")) {
    const person = await holeVereinsterminPerson(vereinId, userId, istAdminOderLesend);
    const termine = (await holeSichtbareVereinstermine(vereinId, person, von)).filter((t) => t.start.getTime() <= bis.getTime());
    for (const t of termine) {
      const serie = t.serieId && t.wiederholung && istWiederholung(t.wiederholung) ? ` · ${serienText(t.wiederholung, t.start)}` : "";
      hinzu(tagKey(t.start), {
        id: `vereinstermin-${t.id}`,
        art: "vereinstermin",
        zeit: formatZeit(t.start),
        label: t.titel,
        typLabel: `${ARTEN[t.art as Art] ?? "Termin"}${serie}`,
        ort: t.ort,
        detailText: t.beschreibung ?? undefined,
        detailHref: `${p.ansicht === "admin" && p.istAdmin ? "/admin/vereinstermine" : "/profil/vereinstermine"}#termin-${t.id}`,
        detailLinkText: p.ansicht === "admin" && p.istAdmin ? "Termin verwalten" : "Zu- oder absagen",
      });
    }
  }

  return { eintraege, verfuegbar: { training: trainingsDaten.darf, verein: verwendetVereinstermine } };
}
