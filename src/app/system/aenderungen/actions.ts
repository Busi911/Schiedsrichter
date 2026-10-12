"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { ligaVereine, stammdatenAenderungen, vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { AUTOMATISCH_ANWENDBAR, pruefeStammdatenWert, STAMMDATEN_FELDER, type StammdatenFeld } from "@/lib/stammdaten-felder";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meldung = (art: "ok" | "fehler", text: string) => `/system/aenderungen?${art}=${encodeURIComponent(text.slice(0, 500))}`;

// Setzt den beantragten Wert. Die Struktur-/Spiele-Synchronisation läuft danach über den Cron
// (legeLigaVereinAn setzt die Sync-Marken zurück, wenn sich eine Vereins-ID ändert).
async function wendeAn(vereinId: string, feld: StammdatenFeld, wert: string | null): Promise<void> {
  const fehler = pruefeStammdatenWert(feld, wert ?? "");
  if (fehler) throw new Error(fehler);
  if (feld === "nuligaClubId" || feld === "handballNetClubId" || feld === "handballNetTeamIds") {
    const [lv, v] = await Promise.all([
      adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId) }),
      adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { name: true } }),
    ]);
    if (!lv || !v) throw new Error("Öffentliche Vereinsseite nicht gefunden.");
    await legeLigaVereinAn(adminDb, {
      vereinId,
      name: v.name,
      nuligaClubId: feld === "nuligaClubId" ? wert : lv.nuligaClubId,
      handballNetClubId: feld === "handballNetClubId" ? wert : lv.handballNetClubId,
      handballNetTeamIds: feld === "handballNetTeamIds" ? wert : lv.handballNetTeamIds,
    });
    return;
  }
  if (feld === "eigeneHallenNamen") {
    await adminDb.update(vereine).set({ eigeneHallenNamen: wert }).where(eq(vereine.id, vereinId));
    return;
  }
  if (feld === "nuligaHalle1Id" || feld === "nuligaHalle2Id" || feld === "nuligaHalle3Id") {
    await adminDb.update(vereine).set({ [feld]: wert }).where(eq(vereine.id, vereinId));
    return;
  }
  throw new Error("Dieses Feld wird von Hand geändert.");
}

async function antwortMail(email: string | null, vereinName: string, feldLabel: string, genehmigt: boolean, notiz: string) {
  if (!email || !email.includes("@")) return;
  try {
    const inhalt = {
      vereinName,
      ueberschrift: genehmigt ? `Eure Änderung „${feldLabel}“ wurde übernommen.` : `Eure Änderung „${feldLabel}“ wurde nicht übernommen.`,
      zeilen: notiz ? [`Hinweis: ${notiz}`] : [],
    };
    await sendMail(email, `Änderungsantrag: ${feldLabel}`, emailAlsText(inhalt), emailAlsHtml(inhalt));
  } catch (err) {
    console.error("Antwort auf Änderungsantrag fehlgeschlagen:", err);
  }
}

// entscheidung = "genehmigen" | "ablehnen". Bei Genehmigung wird der Wert (soweit automatisch möglich) sofort gesetzt.
export async function antragEntscheiden(formData: FormData) {
  const session = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(meldung("fehler", "Antrag fehlt."));
  const genehmigen = formData.get("entscheidung") === "genehmigen";
  const notiz = String(formData.get("notiz") ?? "").trim().slice(0, 500);

  const antrag = await adminDb.query.stammdatenAenderungen.findFirst({ where: eq(stammdatenAenderungen.id, id) });
  if (!antrag || antrag.status !== "offen") redirect(meldung("fehler", "Antrag nicht gefunden oder schon entschieden."));
  const feld = antrag.feld as StammdatenFeld;
  const label = STAMMDATEN_FELDER[feld] ?? antrag.feld;
  const verein = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, antrag.vereinId), columns: { name: true } });

  if (genehmigen && AUTOMATISCH_ANWENDBAR.includes(feld)) {
    try {
      await wendeAn(antrag.vereinId, feld, antrag.neuerWert);
    } catch (err) {
      redirect(meldung("fehler", `Nicht übernommen: ${err instanceof Error ? err.message : "Fehler"}`));
    }
  }

  await adminDb
    .update(stammdatenAenderungen)
    .set({ status: genehmigen ? "genehmigt" : "abgelehnt", entschiedenAm: new Date(), entscheidungNotiz: notiz || null })
    .where(eq(stammdatenAenderungen.id, id));
  const akteur = session.user.email ?? "Systemadmin";
  await schreibeProtokoll(
    antrag.vereinId,
    genehmigen ? "stammdaten_aenderung_genehmigt" : "stammdaten_aenderung_abgelehnt",
    akteur,
    `${label}: „${antrag.bisherigerWert ?? ""}“ → „${antrag.neuerWert ?? ""}“${notiz ? `. Hinweis: ${notiz}` : ""}`
  );
  await antwortMail(antrag.angefragtVon, verein?.name ?? "Verein", label, genehmigen, notiz);

  revalidatePath("/system/aenderungen");
  const hand = genehmigen && !AUTOMATISCH_ANWENDBAR.includes(feld) ? " (von Hand umsetzen)" : "";
  redirect(meldung("ok", `${verein?.name ?? "Verein"}: ${label} ${genehmigen ? "genehmigt" : "abgelehnt"}${hand}.`));
}
