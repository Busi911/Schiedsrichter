import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users } from "@/db/schema";

// Wart für die eigenen Dienste (Fahrer, Kuchen, ...), Seite /profil/dienstwart — eigene Rolle wie ordnerwart (lib/ordnerwart.ts).
// Vereinsadmins dürfen dort immer arbeiten, ohne die Rolle zu haben.
export async function istDienstwart(vereinId: string, userId: string): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const rolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, "dienstwart"),
        eq(funktionstraegerRollen.aktiv, true)
      ),
    });
    return !!rolle;
  });
}

// E-Mail-Adressen aller aktiven Dienstwarte (z.B. für Hinweise auf Selbsteintragungen). "user" hat keine RLS, deshalb der
// ausdrückliche Vereinsfilter.
export async function holeDienstwarteEmails(vereinId: string): Promise<{ email: string }[]> {
  return withTenant(vereinId, (tx) =>
    tx
      .select({ email: users.email })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          eq(users.vereinId, vereinId),
          eq(funktionstraegerRollen.typ, "dienstwart"),
          eq(funktionstraegerRollen.aktiv, true)
        )
      )
  );
}

// Für Hinweise, die jemand sehen MUSS (z.B. Abmeldeanfragen): die Dienstwarte, gibt es keinen aktiven, die Vereinsadmins.
export async function holeDienstwarteOderAdminEmails(vereinId: string): Promise<{ email: string }[]> {
  const warte = await holeDienstwarteEmails(vereinId);
  if (warte.length > 0) return warte;
  return withTenant(vereinId, (tx) =>
    tx
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.vereinId, vereinId), eq(users.istAdmin, true)))
  );
}
