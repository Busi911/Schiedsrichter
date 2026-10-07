"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { betragNetto, type Tarif } from "@/lib/abrechnung";
import { berlinOffset, formatDatum } from "@/lib/format";
import { requireSystemAdmin } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meldung = (art: "ok" | "fehler", text: string) => `/system/abrechnung?${art}=${encodeURIComponent(text.slice(0, 500))}`;

async function ladeVerein(formData: FormData) {
  const vereinId = String(formData.get("vereinId") ?? "");
  if (!UUID.test(vereinId)) redirect(meldung("fehler", "Verein fehlt."));
  const v = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
  if (!v) redirect(meldung("fehler", "Verein nicht gefunden."));
  return v;
}

// Tarif und "Sponsor übernimmt alles" (Vereinspreis + Werbeplatz) je Verein.
export async function tarifSpeichern(formData: FormData) {
  const session = await requireSystemAdmin();
  const v = await ladeVerein(formData);
  const tarif = String(formData.get("tarif") ?? "");
  if (tarif !== "befreit" && tarif !== "beta" && tarif !== "regulaer") redirect(meldung("fehler", "Unbekannter Tarif."));
  const sponsor = formData.get("sponsor") === "on";
  await adminDb.update(vereine).set({ tarif: tarif as Tarif, sponsorUebernimmt: sponsor, zahlungMailMarke: null }).where(eq(vereine.id, v.id));
  await schreibeProtokoll(v.id, "tarif_geaendert", session.user.email ?? "Systemadmin", `Tarif ${tarif}, Sponsor ${sponsor ? "übernimmt" : "nein"} (${betragNetto(tarif as Tarif, sponsor)} € netto)`);
  revalidatePath("/system/abrechnung");
  redirect(meldung("ok", `${v.name}: Tarif gespeichert.`));
}

// Nach Zahlungseingang: Verein "bezahlt bis" setzen. Frist und Mail-Marke werden zurückgesetzt, die Sperre (falls aktiv) ist damit sofort weg.
export async function alsBezahltMarkieren(formData: FormData) {
  const session = await requireSystemAdmin();
  const v = await ladeVerein(formData);
  const datum = String(formData.get("bis") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) redirect(meldung("fehler", "Bitte ein Datum angeben."));
  const bis = new Date(`${datum}T23:59:59${berlinOffset(datum)}`);
  if (Number.isNaN(bis.getTime()) || bis.getTime() < Date.now()) redirect(meldung("fehler", "Das Datum muss in der Zukunft liegen."));
  await adminDb.update(vereine).set({ zahlungBis: bis, zahlungFaelligAm: null, zahlungMailMarke: null }).where(eq(vereine.id, v.id));
  await schreibeProtokoll(v.id, "zahlung_erfasst", session.user.email ?? "Systemadmin", `Bezahlt bis ${formatDatum(bis)}`);
  revalidatePath("/system/abrechnung");
  redirect(meldung("ok", `${v.name}: bezahlt bis ${formatDatum(bis)}.`));
}

// Notbremse: Sperre für diesen Verein aussetzen bzw. wieder scharf stellen (z.B. Zahlungsziel individuell verlängert).
export async function sperreUmschalten(formData: FormData) {
  const session = await requireSystemAdmin();
  const v = await ladeVerein(formData);
  await adminDb.update(vereine).set({ zahlungSperreAus: !v.zahlungSperreAus }).where(eq(vereine.id, v.id));
  await schreibeProtokoll(v.id, v.zahlungSperreAus ? "sperre_scharf" : "sperre_ausgesetzt", session.user.email ?? "Systemadmin");
  revalidatePath("/system/abrechnung");
  redirect(meldung("ok", `${v.name}: Sperre ${v.zahlungSperreAus ? "wieder aktiv" : "ausgesetzt"}.`));
}
