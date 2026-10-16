import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, vereine } from "@/db/schema";
import { darfTrainingSehen } from "./training-ausfall";

// Zeigt der eingeloggten Person den Extra-Punkt "Training" (Navigation, Profil)? Regel rein in darfTrainingSehen (training-ausfall.ts).
export async function sehenTrainingPunkt(
  vereinId: string,
  userId: string,
  istAdmin: boolean,
  istAdminLesend: boolean
): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const [verein, trainer] = await Promise.all([
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { trainingFuerAlleSichtbar: true } }),
      tx.query.funktionstraegerRollen.findFirst({
        where: and(eq(funktionstraegerRollen.userId, userId), eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)),
        columns: { id: true },
      }),
    ]);
    return darfTrainingSehen({ istAdmin, istAdminLesend, istTrainer: !!trainer, fuerAlleSichtbar: verein?.trainingFuerAlleSichtbar ?? false });
  });
}
