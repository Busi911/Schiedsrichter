"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { vereinstermine, vereinsterminSichtbar } from "@/db/schema";
import { parseBerlinDatumZeit } from "@/lib/format";
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

async function schreibeAuswahl(tx: Parameters<Parameters<typeof withTenant>[1]>[0], vereinId: string, terminId: string, w: GepruefterTermin) {
  await tx.delete(vereinsterminSichtbar).where(eq(vereinsterminSichtbar.vereinsterminId, terminId));
  const zeilen = [
    ...w.rollen.map((rolle) => ({ vereinsterminId: terminId, vereinId, rolle, userId: null })),
    ...w.personen.map((userId) => ({ vereinsterminId: terminId, vereinId, rolle: null, userId })),
  ];
  if (zeilen.length > 0) await tx.insert(vereinsterminSichtbar).values(zeilen);
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

  const [neu] = await withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .insert(vereinstermine)
      .values({
        vereinId,
        titel: w.titel,
        art: w.art,
        beschreibung: w.beschreibung,
        ort: w.ort,
        start: w.start,
        ende: w.ende,
        sichtbarkeit: w.sichtbarkeit,
        antwortAbfrage,
        erstelltVon: session.user.id,
      })
      .returning({ id: vereinstermine.id });
    await schreibeAuswahl(tx, vereinId, zeilen[0].id, w);
    return zeilen;
  });

  if (informieren) {
    after(async () => {
      const ziel = zielgruppe(w, await ladeVereinsPersonen(vereinId)).filter((p) => p.id !== session.user.id);
      await sendeVereinsterminMails(vereinId, ziel.map((p) => p.id), {
        id: neu.id, titel: w.titel, art: w.art, start: w.start, ende: w.ende, ort: w.ort, beschreibung: w.beschreibung, antwortAbfrage, variante: "einladung",
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

  const alt = (await ladeVereinstermine(vereinId)).find((t) => t.id === id);
  if (!alt) throw new Error("Termin nicht gefunden.");
  const personen = await ladeVereinsPersonen(vereinId);
  const vorher = new Set(zielgruppe(alt, personen).map((p) => p.id));

  await withTenant(vereinId, async (tx) => {
    await tx
      .update(vereinstermine)
      .set({
        titel: w.titel,
        art: w.art,
        beschreibung: w.beschreibung,
        ort: w.ort,
        start: w.start,
        ende: w.ende,
        sichtbarkeit: w.sichtbarkeit,
        antwortAbfrage,
        aktualisiertAm: new Date(),
      })
      .where(and(eq(vereinstermine.id, id), eq(vereinstermine.vereinId, vereinId)));
    await schreibeAuswahl(tx, vereinId, id, w);
  });

  if (informieren) {
    const geaendert = aenderungen(alt, w);
    const nachher = zielgruppe(w, personen).filter((p) => p.id !== session.user.id);
    const neuDabei = nachher.filter((p) => !vorher.has(p.id));
    const bisherDabei = nachher.filter((p) => vorher.has(p.id));
    const daten = { id, titel: w.titel, art: w.art, start: w.start, ende: w.ende, ort: w.ort, beschreibung: w.beschreibung, antwortAbfrage };
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
export async function vereinsterminLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  if (!id) throw new Error("Termin fehlt.");
  const alt = (await ladeVereinstermine(vereinId)).find((t) => t.id === id);
  if (!alt) throw new Error("Termin nicht gefunden.");
  const antworten = (await ladeAntworten(vereinId, [id])).get(id) ?? [];
  const betroffen = antworten.filter((a) => a.antwort !== "absage" && a.userId !== session.user.id).map((a) => a.userId);

  await withTenant(vereinId, (tx) => tx.delete(vereinstermine).where(and(eq(vereinstermine.id, id), eq(vereinstermine.vereinId, vereinId))));

  // Nur Termine in der Zukunft sagen wir ab; ein vergangener wird still aufgeräumt.
  if (betroffen.length > 0 && alt.start.getTime() > Date.now()) {
    after(() =>
      sendeVereinsterminMails(vereinId, betroffen, {
        id, titel: alt.titel, art: alt.art, start: alt.start, ende: alt.ende, ort: alt.ort, beschreibung: alt.beschreibung, antwortAbfrage: alt.antwortAbfrage, variante: "abgesagt",
      })
    );
  }
  revalidatePath("/admin/vereinstermine");
  revalidatePath("/profil/vereinstermine");
}
