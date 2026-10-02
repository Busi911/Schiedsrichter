"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereinSponsoren } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import {
  pruefeSponsorLink,
  SPONSOR_DAUER_MAX,
  SPONSOR_DAUER_MIN,
  SponsorFehler,
  verarbeiteSponsorBild,
} from "@/lib/sponsor";

function zurueck(vereinId: string, meldung: { ok?: string; fehler?: string }): never {
  const p = new URLSearchParams({ verein: vereinId, ...meldung });
  redirect(`/system/sponsor?${p.toString()}#v-${vereinId}`);
}

// Sponsor eines Vereins speichern (nur Systemadmin). Das Bild ist optional beim erneuten Speichern: ohne
// neue Datei bleibt das bisherige Bild. Alles läuft über adminDb (systemweite Tabelle, kein RLS).
export async function sponsorSpeichern(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");

  try {
    const aktiv = formData.get("aktiv") === "on";
    const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;
    const link = pruefeSponsorLink(String(formData.get("link") ?? ""));
    const dauer = Number(formData.get("dauerSekunden"));
    if (!Number.isInteger(dauer) || dauer < SPONSOR_DAUER_MIN || dauer > SPONSOR_DAUER_MAX) {
      throw new SponsorFehler(`Die Anzeigedauer muss zwischen ${SPONSOR_DAUER_MIN} und ${SPONSOR_DAUER_MAX} Sekunden liegen.`);
    }
    const bisRoh = String(formData.get("gueltigBis") ?? "").trim();
    if (bisRoh && !/^\d{4}-\d{2}-\d{2}$/.test(bisRoh)) throw new SponsorFehler("Das Datum „gültig bis“ ist ungültig.");
    const gueltigBis = bisRoh || null;

    const datei = formData.get("bild");
    const neuesBild = datei instanceof File && datei.size > 0 ? await verarbeiteSponsorBild(Buffer.from(await datei.arrayBuffer())) : null;

    const [bestehend] = await adminDb
      .select({ vereinId: vereinSponsoren.vereinId })
      .from(vereinSponsoren)
      .where(eq(vereinSponsoren.vereinId, vereinId));
    const werte = { aktiv, name, link, dauerSekunden: dauer, gueltigBis, aktualisiertAm: new Date(), ...(neuesBild && { png: neuesBild }) };
    if (bestehend) await adminDb.update(vereinSponsoren).set(werte).where(eq(vereinSponsoren.vereinId, vereinId));
    else await adminDb.insert(vereinSponsoren).values({ vereinId, ...werte });

    await schreibeProtokoll(
      vereinId,
      "sponsor_gespeichert",
      session.user.email ?? session.user.id,
      `${aktiv ? "aktiv" : "aus"}${name ? `, ${name}` : ""}${gueltigBis ? `, bis ${gueltigBis}` : ""}${neuesBild ? ", neues Bild" : ""}`
    );
  } catch (err) {
    if (err instanceof SponsorFehler) zurueck(vereinId, { fehler: err.message });
    throw err;
  }
  revalidatePath("/system/sponsor");
  zurueck(vereinId, { ok: "Gespeichert." });
}

export async function sponsorBildEntfernen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  await adminDb
    .update(vereinSponsoren)
    .set({ png: null, aktiv: false, aktualisiertAm: new Date() })
    .where(eq(vereinSponsoren.vereinId, vereinId));
  await schreibeProtokoll(vereinId, "sponsor_gespeichert", session.user.email ?? session.user.id, "Bild entfernt, aus");
  revalidatePath("/system/sponsor");
  zurueck(vereinId, { ok: "Bild entfernt, Sponsor ausgeschaltet." });
}
