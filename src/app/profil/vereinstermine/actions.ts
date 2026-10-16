"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { vereinsterminAntworten } from "@/db/schema";
import { ladeVereinstermine, holeVereinsterminPerson, vereinstermineAktiv } from "@/lib/vereinstermine-daten";
import { antwortNochMoeglich, darfVereinsterminSehen, istAntwort } from "@/lib/vereinstermine";

// Zu-/Absage der eingeloggten Person: nur für Termine, die sie sehen darf, mit Rückmeldung-Abfrage und noch vor dem Beginn. Eine neue Antwort ersetzt die alte.
export async function vereinsterminAntwortenSetzen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;
  if (!(await vereinstermineAktiv(vereinId))) throw new Error("Vereinstermine sind nicht eingeschaltet.");

  const id = formData.get("id");
  const antwort = formData.get("antwort");
  if (typeof id !== "string" || !id) throw new Error("Termin fehlt.");
  if (typeof antwort !== "string" || !istAntwort(antwort)) throw new Error("Ungültige Antwort.");
  const kommentarRoh = formData.get("kommentar");
  const kommentar = typeof kommentarRoh === "string" && kommentarRoh.trim() ? kommentarRoh.trim().slice(0, 200) : null;

  const termin = (await ladeVereinstermine(vereinId)).find((t) => t.id === id);
  const person = await holeVereinsterminPerson(vereinId, userId, session.user.istAdmin || !!session.user.istAdminLesend);
  if (!termin || !darfVereinsterminSehen(termin, person)) throw new Error("Termin nicht gefunden.");
  if (!termin.antwortAbfrage) throw new Error("Für diesen Termin ist keine Rückmeldung vorgesehen.");
  if (!antwortNochMoeglich(termin.start, new Date())) throw new Error("Der Termin hat schon begonnen.");

  await withTenant(vereinId, (tx) =>
    tx
      .insert(vereinsterminAntworten)
      .values({ vereinsterminId: id, userId, vereinId, antwort, kommentar })
      .onConflictDoUpdate({
        target: [vereinsterminAntworten.vereinsterminId, vereinsterminAntworten.userId],
        set: { antwort, kommentar, aktualisiertAm: new Date() },
      })
  );
  revalidatePath("/profil/vereinstermine");
  revalidatePath("/profil");
  revalidatePath("/admin/vereinstermine");
}

// Antwort zurücknehmen (zurück auf "offen").
export async function vereinsterminAntwortZuruecknehmen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Termin fehlt.");
  await withTenant(vereinId, (tx) =>
    tx
      .delete(vereinsterminAntworten)
      .where(and(eq(vereinsterminAntworten.vereinsterminId, id), eq(vereinsterminAntworten.userId, session.user.id), eq(vereinsterminAntworten.vereinId, vereinId)))
  );
  revalidatePath("/profil/vereinstermine");
  revalidatePath("/admin/vereinstermine");
}
