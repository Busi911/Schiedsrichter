"use server";

import { trainerPerTokenEintragen, type TrainerEintragErgebnis } from "@/lib/trainer-einladung";

// Öffentlich (Token statt Session) — die Logik steckt in lib/trainer-einladung.ts.
export async function trainerEintragen(_vorher: TrainerEintragErgebnis | null, formData: FormData): Promise<TrainerEintragErgebnis> {
  const token = formData.get("token");
  return trainerPerTokenEintragen(typeof token === "string" ? token : "", formData.get("name"), formData.get("email"));
}
