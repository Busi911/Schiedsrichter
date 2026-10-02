"use server";

// Nach einer Aktion bleibt die Seite an der Stelle, an der geklickt wurde, statt nach oben zu
// springen: "status" = Zeile des Vereins im Bereich "Handlungsbedarf", sonst die Detail-Karte.
// (Der Anker "status-…" existiert immer — auch wenn der Verein dort nach der Aktion "erledigt" ist.)
function ziel(formData: FormData, vereinId: string): string {
  return `${formData.get("ziel") === "status" ? "status" : "details"}-${vereinId}`;
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSystemAdmin } from "@/lib/session";
import { adminDb } from "@/db/admin";
import { and, eq, inArray } from "drizzle-orm";
import { ligaSpiele, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { terminVerlegtInhalt } from "@/lib/zuordnung";
import { schreibeProtokoll } from "@/lib/treuhand";
import { vergleicheAnsetzung } from "@/lib/ansetzung-vergleich";
import { vergleicheAnsetzungHandballNet } from "@/lib/ansetzung-vergleich-hnet";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { uebernehmeLigaSpiele } from "@/lib/liga-uebernahme";
import { verknuepfeHallenplanTermine } from "@/lib/hallenplan-verknuepfung";

// Schritt 2a der Zusammenführung: Termine nur mit dem öffentlichen Spiel
// VERKNÜPFEN (ein Verweis je Termin), sonst ändert sich nichts.
export async function hallenplanVerknuepfen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const r = await verknuepfeHallenplanTermine(vereinId, session.user.email ?? session.user.id);
  revalidatePath("/system/abgleich");
  const params = new URLSearchParams({
    verein: vereinId,
    neu: String(r.verknuepft),
    schon: String(r.bereitsVerknuepft),
    dup: String(r.uebersprungenMehrfach),
    zv: String(r.zuordnungenVorher),
    zn: String(r.zuordnungenNachher),
  });
  redirect(`/system/abgleich?${params.toString()}#${ziel(formData, vereinId)}`);
}

// Schritt 3: fehlende künftige Heimspiele still aus den öffentlichen Daten anlegen
// (keine Mails, keine Löschung von Hallenplan-Terminen oder Zuordnungen).
export async function ligaSpieleUebernehmen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const r = await uebernehmeLigaSpiele(vereinId, session.user.email ?? session.user.id);
  revalidatePath("/system/abgleich");
  const params = new URLSearchParams({
    verein: vereinId,
    ueb: String(r.angelegt),
    uebdup: String(r.doppelteEntfernt),
    uebdupd: String(r.doppelteMitDiensten),
    uebzeit: String(r.uebersprungenOhneZeit),
    zv: String(r.zuordnungenVorher),
    zn: String(r.zuordnungenNachher),
  });
  redirect(`/system/abgleich?${params.toString()}#${ziel(formData, vereinId)}`);
}

// Schaltet je Verein, ob der Liga-Sync-Cron fehlende künftige Heimspiele selbst anlegt.
export async function ligaUebernahmeSchalten(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const aktiv = formData.get("aktiv") === "1";
  await adminDb.update(vereine).set({ ligaUebernahmeAktiv: aktiv }).where(eq(vereine.id, vereinId));
  await schreibeProtokoll(
    vereinId,
    aktiv ? "liga_uebernahme_an" : "liga_uebernahme_aus",
    session.user.email ?? session.user.id,
    aktiv ? "Automatische Übernahme künftiger Heimspiele eingeschaltet" : "Automatische Übernahme ausgeschaltet"
  );
  revalidatePath("/system/abgleich");
}

// Nur lesend: vergleicht das angesetzte Schiedsrichter-Kürzel der öffentlichen nuLiga-Daten
// mit dem der Hallenplan-Termine (Vorstufe, bevor der neue Weg die Ansetzung übernimmt).
export async function ansetzungVergleichen(formData: FormData) {
  await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const hnet = formData.get("quelle") === "handball_net";
  const r = hnet ? await vergleicheAnsetzungHandballNet(vereinId, holeHandballNetApi) : await vergleicheAnsetzung(vereinId, holeNuligaHtml);
  const params = new URLSearchParams({
    verein: vereinId,
    av: "1",
    avq: hnet ? "handball_net" : "nuliga",
    avg: String(r.geprueft),
    avgl: String(r.gleich),
    avv: String(r.verschieden),
    avh: String(r.nurHallenplan),
    avo: String(r.nurOeffentlich),
    avl: String(r.beideLeer),
    avf: String(r.gruppenFehler),
    avb: JSON.stringify(r.beispiele),
  });
  redirect(`/system/abgleich?${params.toString()}#${ziel(formData, vereinId)}`);
}

// Bestätigt, dass der Ort eines verknüpften Termins vom öffentlichen Hallennamen abweichen darf
// (z.B. das Spiel findet tatsächlich in der anderen Halle statt). Merkt sich den bestätigten
// öffentlichen Namen; ändert er sich, wird die Abweichung wieder gemeldet. Ändert sonst nichts.
export async function ortBestaetigen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  const terminId = formData.get("terminId");
  if (typeof vereinId !== "string" || !vereinId || typeof terminId !== "string" || !terminId) throw new Error("Angaben fehlen.");
  const [zeile] = await adminDb
    .select({ halle: ligaSpiele.halleName })
    .from(termine)
    .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
    .where(and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)));
  if (!zeile?.halle) throw new Error("Termin nicht verknüpft oder ohne öffentliche Halle.");
  await adminDb
    .update(termine)
    .set({ ligaOrtBestaetigt: zeile.halle })
    .where(and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)));
  await schreibeProtokoll(vereinId, "liga_ort_bestaetigt", session.user.email ?? session.user.id, `Ort-Abweichung bestätigt (öffentlich: ${zeile.halle})`);
  redirect(`/system/abgleich#${ziel(formData, vereinId)}`);
}

// Setzt den Ort EINES verknüpften Termins auf den öffentlichen Hallennamen (der Hallenplan hatte eine
// andere Halle). Zeit, Dienste und Zuordnungen bleiben unverändert; die eingetragenen Personen
// bekommen — wie bei einer manuellen Änderung im Kalender — die Mail "Termin geändert".
export async function ortUebernehmen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  const terminId = formData.get("terminId");
  if (typeof vereinId !== "string" || !vereinId || typeof terminId !== "string" || !terminId) throw new Error("Angaben fehlen.");
  const [t] = await adminDb
    .select({ start: termine.start, ort: termine.ort, beschreibung: termine.beschreibung, halle: ligaSpiele.halleName })
    .from(termine)
    .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
    .where(and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)));
  if (!t?.halle) throw new Error("Termin nicht verknüpft oder ohne öffentliche Halle.");
  if (t.ort !== t.halle) {
    await adminDb.update(termine).set({ ort: t.halle }).where(and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)));
    await schreibeProtokoll(vereinId, "liga_ort_uebernommen", session.user.email ?? session.user.id, `Ort übernommen: „${t.ort ?? "—"}“ → „${t.halle}“`);
    const zuordnungen = await adminDb.select().from(terminZuordnungen).where(eq(terminZuordnungen.terminId, terminId));
    const userIds = [...new Set(zuordnungen.flatMap((z) => (z.userId ? [z.userId] : [])))];
    if (userIds.length > 0) {
      const personen = await adminDb
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.vereinId, vereinId), inArray(users.id, userIds)));
      const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
      for (const p of personen) {
        const rollen = zuordnungen.filter((z) => z.userId === p.id).map((z) => z.funktionstraegerTyp);
        const inhalt: EmailInhalt = {
          vereinName: verein?.name ?? "deinem Verein",
          ...terminVerlegtInhalt(rollen, { start: t.start, ort: t.ort }, { start: t.start, ort: t.halle, beschreibung: t.beschreibung }),
        };
        try {
          await sendMail(p.email, "Termin geändert", emailAlsText(inhalt), emailAlsHtml(inhalt));
        } catch (err) {
          console.error("Termin-geändert-Mail konnte nicht gesendet werden:", err);
        }
      }
    }
  }
  redirect(`/system/abgleich#${ziel(formData, vereinId)}`);
}
