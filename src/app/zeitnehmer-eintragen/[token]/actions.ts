"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, vereine } from "@/db/schema";
import { pruefeBesetzungsgrenze, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { holeZeitnehmerEinsatzZahlen } from "@/lib/zeitnehmerwart";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;
type ZeitnehmerRolle = (typeof ZEITNEHMER_ROLLEN)[number];

// Öffentliche, login-freie Selbsteintragung — Kenntnis des Tokens ist die
// Berechtigung (wie bei /turnier/[token]). Bewusst adminDb für den
// Token-Lookup (keine Session/vereinId vorhanden), danach ausschließlich
// withTenant(verein.id, ...) für alles Weitere — echte Mandantentrennung
// über RLS statt Bypass.
export async function zeitnehmerSelbstEintragenOeffentlich(formData: FormData) {
  const token = formData.get("token");
  const terminId = formData.get("terminId");
  const name = formData.get("name");
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) {
    throw new Error("Ungültiger Link.");
  }
  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (
    typeof rolleRoh !== "string" ||
    !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    throw new Error("Bitte eine Rolle auswählen.");
  }
  const rolle = rolleRoh as ZeitnehmerRolle;
  const eingegebenerName = name.trim();

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.zeitnehmerSelbstanmeldungToken, token),
  });
  if (!verein) {
    throw new Error("Ungültiger oder nicht mehr aktiver Link.");
  }

  // Kandidaten für den Namensabgleich AUSSERHALB der Transaktion geladen,
  // da holeZeitnehmerEinsatzZahlen selbst schon withTenant nutzt (keine
  // verschachtelten Transaktionen).
  const kandidaten = (await holeZeitnehmerEinsatzZahlen(verein.id)).filter((k) =>
    k.rollen.includes(rolle)
  );
  const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);

  const benachrichtigung = await withTenant(verein.id, async (tx) => {
    const termin = await tx.query.termine.findFirst({
      where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    await pruefeBesetzungsgrenze(tx, verein.id, terminId, rolle);

    if (exakt) {
      const vorhanden = await tx.query.terminZuordnungen.findFirst({
        where: and(
          eq(terminZuordnungen.terminId, terminId),
          eq(terminZuordnungen.userId, exakt.userId),
          eq(terminZuordnungen.funktionstraegerTyp, rolle)
        ),
      });
      if (vorhanden) return null;

      await tx.insert(terminZuordnungen).values({
        terminId,
        userId: exakt.userId,
        funktionstraegerTyp: rolle,
        quelle: "selbst_eingetragen_oeffentlich",
      });

      // Anders als bei der eingeloggten Selbstanmeldung (selbstAnmelden in
      // profil/actions.ts) hat hier möglicherweise eine ANDERE Person den
      // Namen eingetragen — die zugeordnete Person weiß davon noch nichts,
      // daher wie bei jeder Fremdzuordnung eine Benachrichtigung.
      const kandidatMitMail = kandidaten.find((k) => k.userId === exakt.userId);
      if (!kandidatMitMail) return null;
      return {
        termin,
        email: kandidatMitMail.email,
        vereinName: verein.name,
        rolle,
      };
    }

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: null,
      externerName: eingegebenerName,
      matchVorschlagUserId: vorschlag?.userId ?? null,
      funktionstraegerTyp: rolle,
      quelle: "selbst_eingetragen_oeffentlich",
    });
    return null;
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungsMailInhalt(benachrichtigung.rolle, benachrichtigung.termin),
    };
    try {
      await sendMail(
        benachrichtigung.email,
        "Neue Termin-Zuordnung",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath(`/zeitnehmer-eintragen/${token}`);
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}
