"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  pushAbos,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { syncSchiedsrichterIcsFeed } from "@/lib/ics-sync";
import { bedarfFuer } from "@/lib/dienste";

const SELBST_ANMELDBARE_TYPEN = ["ordner", "kioskdienst"] as const;

// Selbstverwaltung der eigenen Stammdaten (Name, Telefonnummer) — bewusst
// OHNE E-Mail-Änderung, die bleibt Admin-Aufgabe (login-kritisch, siehe
// updateFunktionstraeger in admin/actions.ts, das zusätzlich beide Adressen
// informiert).
export async function updateStammdaten(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const name = formData.get("name");
  const telefonnummer = formData.get("telefonnummer");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .update(users)
      .set({
        name: name.trim(),
        telefonnummer:
          typeof telefonnummer === "string" && telefonnummer.trim()
            ? telefonnummer.trim()
            : null,
      })
      .where(eq(users.id, userId))
  );

  revalidatePath("/profil");
}

export async function updateIcsFeedUrl(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const icsFeedUrl = formData.get("icsFeedUrl");
  if (typeof icsFeedUrl !== "string" || !icsFeedUrl.trim()) {
    throw new Error("ICS-Feed-URL ist erforderlich.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .insert(schiedsrichterProfile)
      .values({ userId, icsFeedUrl: icsFeedUrl.trim() })
      .onConflictDoUpdate({
        target: schiedsrichterProfile.userId,
        set: { icsFeedUrl: icsFeedUrl.trim() },
      })
  );

  revalidatePath("/profil");
}

export async function selbstAnmelden(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const terminId = formData.get("terminId");
  const typ = formData.get("typ");
  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }
  if (
    typeof typ !== "string" ||
    !(SELBST_ANMELDBARE_TYPEN as readonly string[]).includes(typ)
  ) {
    throw new Error("Ungültige Rolle.");
  }

  const rolle = typ as (typeof SELBST_ANMELDBARE_TYPEN)[number];

  await withTenant(vereinId, async (tx) => {
    const eigeneRolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, rolle)
      ),
    });
    if (!eigeneRolle || !eigeneRolle.aktiv) {
      throw new Error("Diese Rolle ist für dich nicht (mehr) aktiv.");
    }

    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (vorhanden) return;

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, terminId),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) throw new Error("Verein nicht gefunden.");

    const bedarf = bedarfFuer(
      verein,
      termin.typ,
      rolle,
      termin.pflichtspiel,
      termin.freundschaftsTyp
    );
    const bestehende = await tx.query.terminZuordnungen.findMany({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (bestehende.length >= bedarf) {
      throw new Error(
        "Für diesen Dienst sind bereits genug Personen angemeldet."
      );
    }

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "selbst_angemeldet",
    });
  });

  revalidatePath("/profil");
}

export async function selbstAbmelden(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    // Sicherheitscheck: nur die eigene Anmeldung darf abgemeldet werden.
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (!zuordnung || zuordnung.userId !== userId) return;

    await tx
      .delete(terminZuordnungen)
      .where(eq(terminZuordnungen.id, zuordnungId));
  });

  revalidatePath("/profil");
}

type PushSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Vom Client (siehe src/components/push-anmelden.tsx) direkt aufgerufene
// Server Actions, kein <form> — Next.js erlaubt das für "use server"-
// exportierte Funktionen genauso wie den form-action-Aufruf.
export async function pushAbonnieren(subscription: PushSubscriptionJson) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  await withTenant(vereinId, (tx) =>
    tx
      .insert(pushAbos)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushAbos.endpoint,
        set: {
          userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      })
  );
}

export async function pushAbbestellen(endpoint: string) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;

  await withTenant(vereinId, (tx) =>
    tx.delete(pushAbos).where(eq(pushAbos.endpoint, endpoint))
  );
}

export async function syncJetzt() {
  const session = await requireSession();
  try {
    await syncSchiedsrichterIcsFeed(session.user.vereinId!, session.user.id);
  } catch {
    // Fehler ist bereits in schiedsrichter_profil/ics_sync_log festgehalten
    // (siehe syncSchiedsrichterIcsFeed) und wird auf der Profilseite angezeigt.
  }
  revalidatePath("/profil");
}
