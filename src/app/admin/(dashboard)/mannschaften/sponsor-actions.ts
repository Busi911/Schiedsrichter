"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaftSponsoren } from "@/db/schema";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import { pruefeSponsorLink, SponsorFehler, verarbeiteSponsorBild } from "@/lib/sponsor";
import { mannschaftGehoertZumVerein } from "@/lib/mannschaft-sponsor";
import { verbieteImDemo } from "@/lib/demo-verein";

function zurueck(meldung: { ok?: string; fehler?: string }, ligaMannschaftId?: string): never {
  const p = new URLSearchParams(meldung);
  if (ligaMannschaftId) p.set("sponsor", ligaMannschaftId);
  redirect(`/admin/mannschaften?${p.toString()}#sponsor${ligaMannschaftId ? `-${ligaMannschaftId}` : "en"}`);
}

function mannschaftsId(formData: FormData): string {
  const id = formData.get("ligaMannschaftId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Mannschaft fehlt.");
  return id;
}

// Sponsor einer Mannschaft speichern (Admin mit Schreibrecht). Das Bild ist beim erneuten Speichern optional:
// ohne neue Datei bleibt das bisherige. Ohne Bild wirkt der Sponsor nie (sponsorWirksam).
export async function mannschaftSponsorSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  await verbieteImDemo(vereinId);
  const ligaMannschaftId = mannschaftsId(formData);
  if (!(await mannschaftGehoertZumVerein(vereinId, ligaMannschaftId))) throw new Error("Mannschaft nicht gefunden.");

  try {
    const aktiv = formData.get("aktiv") === "on";
    const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;
    const link = pruefeSponsorLink(String(formData.get("link") ?? ""));
    const bisRoh = String(formData.get("gueltigBis") ?? "").trim();
    if (bisRoh && !/^\d{4}-\d{2}-\d{2}$/.test(bisRoh)) throw new SponsorFehler("Das Datum „gültig bis“ ist ungültig.");
    const gueltigBis = bisRoh || null;
    const datei = formData.get("bild");
    const neuesBild =
      datei instanceof File && datei.size > 0 ? await verarbeiteSponsorBild(Buffer.from(await datei.arrayBuffer())) : null;

    await withTenant(vereinId, async (tx) => {
      const werte = { aktiv, name, link, gueltigBis, aktualisiertAm: new Date(), ...(neuesBild && { bild: neuesBild }) };
      const [bestehend] = await tx
        .select({ id: mannschaftSponsoren.id })
        .from(mannschaftSponsoren)
        .where(and(eq(mannschaftSponsoren.vereinId, vereinId), eq(mannschaftSponsoren.ligaMannschaftId, ligaMannschaftId)));
      if (bestehend) await tx.update(mannschaftSponsoren).set(werte).where(eq(mannschaftSponsoren.id, bestehend.id));
      else await tx.insert(mannschaftSponsoren).values({ vereinId, ligaMannschaftId, ...werte });
    });
    await schreibeProtokoll(
      vereinId,
      "mannschaft_sponsor_gespeichert",
      session.user.email ?? session.user.id,
      `${aktiv ? "aktiv" : "aus"}${name ? `, ${name}` : ""}${neuesBild ? ", neues Bild" : ""}`
    );
  } catch (err) {
    if (err instanceof SponsorFehler) zurueck({ fehler: err.message }, ligaMannschaftId);
    throw err;
  }
  revalidatePath("/admin/mannschaften");
  zurueck({ ok: "Sponsor gespeichert." }, ligaMannschaftId);
}

// Sponsor der Mannschaft ganz entfernen (Zeile samt Bild).
export async function mannschaftSponsorEntfernen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  await verbieteImDemo(vereinId);
  const ligaMannschaftId = mannschaftsId(formData);
  await withTenant(vereinId, (tx) =>
    tx
      .delete(mannschaftSponsoren)
      .where(and(eq(mannschaftSponsoren.vereinId, vereinId), eq(mannschaftSponsoren.ligaMannschaftId, ligaMannschaftId)))
  );
  await schreibeProtokoll(vereinId, "mannschaft_sponsor_gespeichert", session.user.email ?? session.user.id, "entfernt");
  revalidatePath("/admin/mannschaften");
  zurueck({ ok: "Sponsor entfernt." }, ligaMannschaftId);
}
