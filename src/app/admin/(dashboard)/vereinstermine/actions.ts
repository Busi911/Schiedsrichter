"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { vereinstermine, vereinsterminSichtbar } from "@/db/schema";
import { formatDatum, parseBerlinDatumZeit, toDatetimeLocalWert } from "@/lib/format";
import { berechneSerie, pruefeSerienEingabe, serienText, istWiederholung } from "@/lib/wiederholung";
import { aenderungen, pruefeVereinstermin, type GepruefterTermin, type TerminEingabe } from "@/lib/vereinstermine";
import { ladeAntworten, ladeVereinsPersonen, ladeVereinstermine, vereinstermineAktiv, zielgruppe } from "@/lib/vereinstermine-daten";
import { sendeVereinsterminMails } from "@/lib/vereinstermin-mail";

function text(formData: FormData, feld: string): string {
  const w = formData.get(feld);
  return typeof w === "string" ? w : "";
}

function datum(formData: FormData, feld: string): Date | null {
  const w = text(formData, feld);
  return w ? parseBerlinDatumZeit(w) : null;
}

function leseEingabe(formData: FormData): TerminEingabe {
  return {
    titel: text(formData, "titel"),
    art: text(formData, "art"),
    beschreibung: text(formData, "beschreibung"),
    ort: text(formData, "ort"),
    start: datum(formData, "start"),
    ende: datum(formData, "ende"),
    sichtbarkeit: text(formData, "sichtbarkeit"),
    rollen: formData.getAll("rollen").filter((x): x is string => typeof x === "string"),
    personen: formData.getAll("personen").filter((x): x is string => typeof x === "string"),
  };
}

function pruefe(formData: FormData): GepruefterTermin {
  const ergebnis = pruefeVereinstermin(leseEingabe(formData));
  if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
  return ergebnis.wert;
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

// Schreibt die Auswahl (Rollen/Personen) für einen oder mehrere Termine neu (bei Serien für alle betroffenen Termine).
async function schreibeAuswahl(tx: Tx, vereinId: string, terminIds: string[], w: GepruefterTermin) {
  await tx.delete(vereinsterminSichtbar).where(inArray(vereinsterminSichtbar.vereinsterminId, terminIds));
  const zeilen = terminIds.flatMap((terminId) => [
    ...w.rollen.map((rolle) => ({ vereinsterminId: terminId, vereinId, rolle, userId: null })),
    ...w.personen.map((userId) => ({ vereinsterminId: terminId, vereinId, rolle: null, userId })),
  ]);
  if (zeilen.length > 0) await tx.insert(vereinsterminSichtbar).values(zeilen);
}

// Satz für die Mail einer Serie, z.B. "Wiederholt sich jeden 4. Donnerstag im Monat, bis 31.03.2027 (6 Termine)."
function serienSatz(wiederholung: string, starts: Date[]): string {
  const w = istWiederholung(wiederholung) ? serienText(wiederholung, starts[0]) : wiederholung;
  return `Wiederholt sich ${w}, bis ${formatDatum(starts[starts.length - 1])} (${starts.length} Termine).`;
}

// Nur Personen DIESES Vereins dürfen ausgewählt werden ("user" hat keine RLS, ein manipuliertes Formular könnte fremde IDs schicken).
async function nurEigenePersonen(vereinId: string, w: GepruefterTermin): Promise<GepruefterTermin> {
  if (w.personen.length === 0) return w;
  const eigene = new Set((await ladeVereinsPersonen(vereinId)).map((p) => p.id));
  return { ...w, personen: w.personen.filter((id) => eigene.has(id)) };
}

async function pruefeAktiv(vereinId: string) {
  if (!(await vereinstermineAktiv(vereinId))) throw new Error("Vereinstermine sind nicht eingeschaltet (Einstellungen → Vereinstermine).");
}

export async function vereinsterminAnlegen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  await pruefeAktiv(vereinId);
  const w = await nurEigenePersonen(vereinId, pruefe(formData));
  const antwortAbfrage = formData.get("antwortAbfrage") === "on";
  const informieren = formData.get("benachrichtigen") === "on";

  const serie = pruefeSerienEingabe(text(formData, "wiederholung"), text(formData, "bis"), w.start);
  if ("fehler" in serie) throw new Error(serie.fehler);
  const starts = serie.wert ? berechneSerie(w.start, serie.wert.wiederholung, serie.wert.bis) : [w.start];
  const dauer = w.ende ? w.ende.getTime() - w.start.getTime() : null;
  const serieId = serie.wert ? randomUUID() : null;

  const angelegt = await withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .insert(vereinstermine)
      .values(
        starts.map((start) => ({
          vereinId,
          titel: w.titel,
          art: w.art,
          beschreibung: w.beschreibung,
          ort: w.ort,
          start,
          ende: dauer === null ? null : new Date(start.getTime() + dauer),
          sichtbarkeit: w.sichtbarkeit,
          antwortAbfrage,
          serieId,
          wiederholung: serie.wert?.wiederholung ?? null,
          erstelltVon: session.user.id,
        }))
      )
      .returning({ id: vereinstermine.id, start: vereinstermine.start });
    await schreibeAuswahl(tx, vereinId, zeilen.map((z) => z.id), w);
    return zeilen.sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  if (informieren) {
    // Eine Mail für die ganze Serie (zum ersten Termin), nicht eine je Termin.
    const neu = angelegt[0];
    const satz = serie.wert ? serienSatz(serie.wert.wiederholung, starts) : undefined;
    after(async () => {
      const ziel = zielgruppe(w, await ladeVereinsPersonen(vereinId)).filter((p) => p.id !== session.user.id);
      await sendeVereinsterminMails(vereinId, ziel.map((p) => p.id), {
        id: neu.id, titel: w.titel, art: w.art, start: w.start, ende: w.ende, ort: w.ort, beschreibung: w.beschreibung, antwortAbfrage, variante: "einladung", serie: satz,
      });
    });
  }
  revalidatePath("/admin/vereinstermine");
  revalidatePath("/profil/vereinstermine");
}

export async function vereinsterminAendern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  await pruefeAktiv(vereinId);
  const id = text(formData, "id");
  if (!id) throw new Error("Termin fehlt.");
  const w = await nurEigenePersonen(vereinId, pruefe(formData));
  const antwortAbfrage = formData.get("antwortAbfrage") === "on";
  const informieren = formData.get("benachrichtigen") === "on";

  const alle = await ladeVereinstermine(vereinId);
  const alt = alle.find((t) => t.id === id);
  if (!alt) throw new Error("Termin nicht gefunden.");
  // Serie: "diesen und alle folgenden" ändern — die folgenden behalten ihren Tag, nehmen aber Uhrzeit und Dauer des bearbeiteten Termins an.
  const betroffen = formData.get("folgende") === "on" && alt.serieId ? alle.filter((t) => t.serieId === alt.serieId && t.start.getTime() >= alt.start.getTime()) : [alt];
  const personen = await ladeVereinsPersonen(vereinId);
  const vorher = new Set(zielgruppe(alt, personen).map((p) => p.id));
  const dauer = w.ende ? w.ende.getTime() - w.start.getTime() : null;
  const neueZeit = toDatetimeLocalWert(w.start).slice(11, 16);

  await withTenant(vereinId, async (tx) => {
    for (const t of betroffen) {
      const dieser = t.id === id;
      const start = dieser ? w.start : parseBerlinDatumZeit(`${toDatetimeLocalWert(t.start).slice(0, 10)}T${neueZeit}`);
      await tx
        .update(vereinstermine)
        .set({
          titel: w.titel,
          art: w.art,
          beschreibung: w.beschreibung,
          ort: w.ort,
          start,
          ende: dauer === null ? null : new Date(start.getTime() + dauer),
          sichtbarkeit: w.sichtbarkeit,
          antwortAbfrage,
          aktualisiertAm: new Date(),
        })
        .where(and(eq(vereinstermine.id, t.id), eq(vereinstermine.vereinId, vereinId)));
    }
    await schreibeAuswahl(tx, vereinId, betroffen.map((t) => t.id), w);
  });

  if (informieren) {
    const geaendert = aenderungen(alt, w);
    const nachher = zielgruppe(w, personen).filter((p) => p.id !== session.user.id);
    const neuDabei = nachher.filter((p) => !vorher.has(p.id));
    const bisherDabei = nachher.filter((p) => vorher.has(p.id));
    const serieText = betroffen.length > 1 && alt.wiederholung && istWiederholung(alt.wiederholung) ? `Gilt auch für die folgenden Termine der Serie (${serienText(alt.wiederholung, alt.start)}).` : undefined;
    const daten = { id, titel: w.titel, art: w.art, start: w.start, ende: w.ende, ort: w.ort, beschreibung: w.beschreibung, antwortAbfrage, serie: serieText };
    after(async () => {
      // Wer neu in der Zielgruppe ist, bekommt eine Einladung; wer schon dabei war, nur bei einer relevanten Änderung eine Änderungsmail.
      await sendeVereinsterminMails(vereinId, neuDabei.map((p) => p.id), { ...daten, variante: "einladung" });
      if (geaendert.length > 0) {
        await sendeVereinsterminMails(vereinId, bisherDabei.map((p) => p.id), { ...daten, variante: "geaendert", geaendert });
      }
    });
  }
  revalidatePath("/admin/vereinstermine");
  revalidatePath("/profil/vereinstermine");
}

// Löschen = Absage: wer zugesagt oder "vielleicht" geantwortet hat, bekommt eine Absage-Mail (alle anderen wissen vom Termin ggf. gar nichts).
// Bei einer Serie nur diesen Termin oder (scope "folgende") diesen und alle folgenden — dann EINE Mail je Person.
export async function vereinsterminLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  if (!id) throw new Error("Termin fehlt.");
  const alle = await ladeVereinstermine(vereinId);
  const alt = alle.find((t) => t.id === id);
  if (!alt) throw new Error("Termin nicht gefunden.");
  const betroffen = text(formData, "scope") === "folgende" && alt.serieId ? alle.filter((t) => t.serieId === alt.serieId && t.start.getTime() >= alt.start.getTime()) : [alt];
  const antworten = await ladeAntworten(vereinId, betroffen.map((t) => t.id));
  const zuInformieren = [
    ...new Set(betroffen.flatMap((t) => (antworten.get(t.id) ?? []).filter((a) => a.antwort !== "absage" && a.userId !== session.user.id).map((a) => a.userId))),
  ];

  await withTenant(vereinId, (tx) =>
    tx.delete(vereinstermine).where(and(inArray(vereinstermine.id, betroffen.map((t) => t.id)), eq(vereinstermine.vereinId, vereinId)))
  );

  // Nur Termine in der Zukunft sagen wir ab; ein vergangener wird still aufgeräumt.
  if (zuInformieren.length > 0 && alt.start.getTime() > Date.now()) {
    const satz = betroffen.length > 1 && alt.wiederholung && istWiederholung(alt.wiederholung) ? `Betrifft diesen und alle folgenden Termine der Serie (${serienText(alt.wiederholung, alt.start)}).` : undefined;
    after(() =>
      sendeVereinsterminMails(vereinId, zuInformieren, {
        id, titel: alt.titel, art: alt.art, start: alt.start, ende: alt.ende, ort: alt.ort, beschreibung: alt.beschreibung, antwortAbfrage: alt.antwortAbfrage, variante: "abgesagt", serie: satz,
      })
    );
  }
  revalidatePath("/admin/vereinstermine");
  revalidatePath("/profil/vereinstermine");
}
