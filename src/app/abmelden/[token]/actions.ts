"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeAbmeldeToken, setzeAbmeldung } from "@/lib/abmelden";

// Öffentlich (Kenntnis des persönlichen, signierten Links ist die Berechtigung). Die Änderung passiert
// bewusst erst nach einem Klick (POST), nicht beim bloßen Aufruf: Mail-Scanner rufen Links vorab ab.
async function setze(formData: FormData, aktiv: boolean) {
  const token = formData.get("token");
  const gueltig = typeof token === "string" ? pruefeAbmeldeToken(token) : null;
  if (!gueltig || typeof token !== "string") throw new Error("Ungültiger Link.");
  await setzeAbmeldung(gueltig.userId, gueltig.art, aktiv);
  revalidatePath(`/abmelden/${token}`);
  redirect(`/abmelden/${token}`);
}

export async function abbestellen(formData: FormData) {
  await setze(formData, false);
}

export async function wiederAnmelden(formData: FormData) {
  await setze(formData, true);
}
