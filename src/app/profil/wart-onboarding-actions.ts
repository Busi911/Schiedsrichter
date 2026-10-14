"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { WART_ONBOARDING_COOKIE, WART_ROLLEN, type WartRolle } from "@/lib/wart-onboarding";

// "Ausblenden" der Onboarding-Karte (lib/wart-onboarding.ts): nur ein Cookie auf diesem Gerät, keine Datenbank. Die Karte verschwindet
// ohnehin von selbst, sobald alle Schritte erledigt sind.
export async function wartOnboardingAusblenden(formData: FormData) {
  await requireSession();
  const rolle = formData.get("rolle");
  if (typeof rolle !== "string" || !(WART_ROLLEN as readonly string[]).includes(rolle)) return;
  const jar = await cookies();
  const aktuell = (jar.get(WART_ONBOARDING_COOKIE)?.value ?? "").split(",").filter((r): r is WartRolle => (WART_ROLLEN as readonly string[]).includes(r));
  if (!aktuell.includes(rolle as WartRolle)) aktuell.push(rolle as WartRolle);
  jar.set(WART_ONBOARDING_COOKIE, aktuell.join(","), { path: "/profil", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath(`/profil/${rolle === "dienst" ? "dienstwart" : `${rolle}wart`}`);
}
