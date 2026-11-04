"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { neuigkeiten } from "@/db/schema";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import { NeuigkeitFehler, pruefeNeuigkeit } from "@/lib/neuigkeiten";
import { neuigkeitenAktiv } from "@/lib/neuigkeiten-daten";
import { mannschaftGehoertZumVerein } from "@/lib/mannschaft-sponsor";

function zurueck(meldung: { ok?: string; fehler?: string }, id?: string): never {
  const p = new URLSearchParams(meldung);
  if (id) p.set("n", id);
  redirect(`/admin/neuigkeiten?${p.toString()}`);
}

function idAus(formData: FormData): string {
  const id = formData.get("id");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Eintrag fehlt.");
  return id;
}

async function vorbedingung() {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  if (!(await neuigkeitenAktiv(vereinId))) throw new Error("Neuigkeiten sind nicht eingeschaltet (Einstellungen → Neuigkeiten).");
  return { session, vereinId };
}

function revalidiere() {
  revalidatePath("/admin/neuigkeiten");
  revalidatePath("/verein", "layout");
}

// Neu anlegen (ohne `id`) oder ändern. "Veröffentlichen" setzt den Zeitpunkt (bleibt bei einer Änderung erhalten), "Entwurf"
// speichert nur: öffentlich sichtbar ist erst, was veröffentlicht ist.
export async function neuigkeitSpeichern(formData: FormData) {
  const { session, vereinId } = await vorbedingung();
  const idRoh = formData.get("id");
  const id = typeof idRoh === "string" && idRoh ? idAus(formData) : null;
  const veroeffentlichen = formData.get("aktion") === "veroeffentlichen";
  let ergebnisId = id;
  try {
    const { titel, text } = pruefeNeuigkeit({ titel: String(formData.get("titel") ?? ""), text: String(formData.get("text") ?? "") });
    const mRoh = String(formData.get("ligaMannschaftId") ?? "");
    const ligaMannschaftId = mRoh && /^[0-9a-f-]{36}$/i.test(mRoh) ? mRoh : null;
    // liga_mannschaft hat keine RLS: die Zugehörigkeit zum eigenen Verein prüfen wir selbst.
    if (ligaMannschaftId && !(await mannschaftGehoertZumVerein(vereinId, ligaMannschaftId))) throw new NeuigkeitFehler("Die Mannschaft gehört nicht zu diesem Verein.");

    await withTenant(vereinId, async (tx) => {
      if (id) {
        const [alt] = await tx.select({ am: neuigkeiten.veroeffentlichtAm }).from(neuigkeiten).where(and(eq(neuigkeiten.vereinId, vereinId), eq(neuigkeiten.id, id)));
        if (!alt) throw new NeuigkeitFehler("Eintrag nicht gefunden.");
        await tx
          .update(neuigkeiten)
          .set({ titel, text, ligaMannschaftId, aktualisiertAm: new Date(), ...(veroeffentlichen && !alt.am && { veroeffentlichtAm: new Date() }) })
          .where(and(eq(neuigkeiten.vereinId, vereinId), eq(neuigkeiten.id, id)));
      } else {
        const [neu] = await tx
          .insert(neuigkeiten)
          .values({ vereinId, titel, text, ligaMannschaftId, veroeffentlichtAm: veroeffentlichen ? new Date() : null })
          .returning({ id: neuigkeiten.id });
        ergebnisId = neu.id;
      }
    });
    await schreibeProtokoll(vereinId, "neuigkeit_gespeichert", session.user.email ?? session.user.id, `${id ? "geändert" : "neu"}${veroeffentlichen ? ", veröffentlicht" : ""}: ${titel.slice(0, 60)}`);
  } catch (err) {
    if (err instanceof NeuigkeitFehler) zurueck({ fehler: err.message }, id ?? undefined);
    throw err;
  }
  revalidiere();
  zurueck({ ok: veroeffentlichen ? "Veröffentlicht." : "Als Entwurf gespeichert." }, ergebnisId ?? undefined);
}

export async function neuigkeitZurueckziehen(formData: FormData) {
  const { session, vereinId } = await vorbedingung();
  const id = idAus(formData);
  await withTenant(vereinId, (tx) =>
    tx.update(neuigkeiten).set({ veroeffentlichtAm: null, aktualisiertAm: new Date() }).where(and(eq(neuigkeiten.vereinId, vereinId), eq(neuigkeiten.id, id)))
  );
  await schreibeProtokoll(vereinId, "neuigkeit_gespeichert", session.user.email ?? session.user.id, "zurückgezogen (Entwurf)");
  revalidiere();
  zurueck({ ok: "Zurückgezogen: die Neuigkeit ist wieder ein Entwurf und öffentlich nicht mehr sichtbar." }, id);
}

export async function neuigkeitLoeschen(formData: FormData) {
  const { session, vereinId } = await vorbedingung();
  const id = idAus(formData);
  await withTenant(vereinId, (tx) => tx.delete(neuigkeiten).where(and(eq(neuigkeiten.vereinId, vereinId), eq(neuigkeiten.id, id))));
  await schreibeProtokoll(vereinId, "neuigkeit_gespeichert", session.user.email ?? session.user.id, "gelöscht");
  revalidiere();
  zurueck({ ok: "Gelöscht." });
}
