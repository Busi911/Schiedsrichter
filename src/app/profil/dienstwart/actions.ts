"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { dienstArten, termine, terminDienstBedarf, terminZuordnungen, users, vereine } from "@/db/schema";
import { istDienstwart } from "@/lib/dienstwart";
import { bedarfEigenerDienst, bedarfSchluessel, pruefeBedarf } from "@/lib/eigene-dienste";
import { ladeEigeneDiensteKontext } from "@/lib/eigene-dienste-daten";
import { zuordnungEntferntInhalt, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

// Einteilen für eigene Dienste (Fahrer, Kuchen, ...) auf /profil/dienstwart. Dürfen: Vereinsadmins (nicht "nur lesend") und Personen
// mit der Rolle Dienstwart.
async function pruefeDienstwart() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  if (!session.user.istAdmin && !(await istDienstwart(vereinId, session.user.id))) {
    throw new Error("Keine Berechtigung als Dienstwart.");
  }
  return { session, vereinId };
}

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function aktualisiereSeiten() {
  revalidatePath("/profil/dienstwart");
  revalidatePath("/admin/kalender");
  revalidatePath("/admin");
  revalidatePath("/admin/dienste");
}

// Person (Feld "person" = userId) ODER freier Name ohne Login (Feld "externerName").
export async function dienstZuordnen(formData: FormData) {
  const { vereinId } = await pruefeDienstwart();
  const terminId = text(formData, "terminId");
  const dienstArtId = text(formData, "dienstArtId");
  const userId = text(formData, "person") || null;
  const externerName = text(formData, "externerName").slice(0, 80) || null;
  if (!terminId || !dienstArtId) throw new Error("Termin oder Dienst fehlt.");
  if (!userId && !externerName) throw new Error("Bitte eine Person auswählen oder einen Namen eingeben.");

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    // Termin und Dienst über RLS UND ausdrücklichen Vereinsfilter: eine manipulierte Id eines fremden Vereins findet nichts.
    const termin = await tx.query.termine.findFirst({ where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)) });
    if (!termin) throw new Error("Termin nicht gefunden.");
    const art = await tx.query.dienstArten.findFirst({
      where: and(eq(dienstArten.id, dienstArtId), eq(dienstArten.vereinId, vereinId)),
    });
    if (!art || !art.aktiv) throw new Error("Dienst nicht gefunden oder deaktiviert.");

    // "user" hat keine RLS: die Person muss ausdrücklich zu diesem Verein gehören.
    const person = userId
      ? await tx.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.vereinId, vereinId)) })
      : null;
    if (userId && !person) throw new Error("Person nicht gefunden.");

    const bisher = await tx
      .select({ userId: terminZuordnungen.userId, externerName: terminZuordnungen.externerName })
      .from(terminZuordnungen)
      .where(
        and(
          eq(terminZuordnungen.terminId, terminId),
          eq(terminZuordnungen.funktionstraegerTyp, "eigener_dienst"),
          eq(terminZuordnungen.dienstArtId, dienstArtId)
        )
      );
    const schonDabei = bisher.some((b) =>
      userId ? b.userId === userId : !!b.externerName && b.externerName.toLowerCase() === externerName!.toLowerCase()
    );
    if (schonDabei) throw new Error("Diese Person ist für diesen Dienst schon eingeteilt.");

    // Nicht mehr Personen als gebraucht (wie bei den Helferdiensten, siehe pruefeOrdnerBesetzungsgrenze).
    const kontext = await ladeEigeneDiensteKontext(tx, vereinId, [terminId]);
    const regel = kontext.arten.find((a) => a.id === dienstArtId)!;
    const bedarf = bedarfEigenerDienst(regel, termin, kontext.overrides.get(bedarfSchluessel(terminId, dienstArtId)));
    if (bisher.length >= bedarf) {
      throw new Error(`Für „${art.name}“ sind schon alle ${bedarf} Plätze besetzt. Bei Bedarf erst den Bedarf für diesen Termin erhöhen.`);
    }

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: person?.id ?? null,
      externerName: person ? null : externerName,
      funktionstraegerTyp: "eigener_dienst",
      dienstArtId,
      quelle: "zugeordnet_durch_admin",
    });

    if (!person) return null; // ohne Login keine Mail
    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
    return { termin, email: person.email, dienstName: art.name, hinweis: art.beschreibung, vereinName: verein?.name ?? "HandballerPate" };
  });

  if (benachrichtigung) {
    const inhalt = zuordnungsMailInhalt(benachrichtigung.dienstName, benachrichtigung.termin);
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...inhalt,
      zeilen: benachrichtigung.hinweis ? [...inhalt.zeilen, `Hinweis: ${benachrichtigung.hinweis}`] : inhalt.zeilen,
    };
    try {
      await sendMail(benachrichtigung.email, "Neue Termin-Zuordnung", terminMailText(mailParams), terminMailHtml(mailParams));
    } catch (err) {
      console.error("Zuordnungs-Mail (eigener Dienst) konnte nicht gesendet werden:", err);
    }
  }
  aktualisiereSeiten();
}

export async function dienstZuordnungEntfernen(formData: FormData) {
  const { vereinId } = await pruefeDienstwart();
  const zuordnungId = text(formData, "zuordnungId");

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: and(eq(terminZuordnungen.id, zuordnungId), eq(terminZuordnungen.funktionstraegerTyp, "eigener_dienst")),
    });
    if (!zuordnung) throw new Error("Einteilung nicht gefunden.");
    await tx.delete(terminZuordnungen).where(eq(terminZuordnungen.id, zuordnungId));
    if (!zuordnung.userId) return null;

    const [person, termin, art, verein] = await Promise.all([
      tx.query.users.findFirst({ where: and(eq(users.id, zuordnung.userId), eq(users.vereinId, vereinId)) }),
      tx.query.termine.findFirst({ where: eq(termine.id, zuordnung.terminId) }),
      zuordnung.dienstArtId ? tx.query.dienstArten.findFirst({ where: eq(dienstArten.id, zuordnung.dienstArtId) }) : null,
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }),
    ]);
    if (!person || !termin) return null;
    return { termin, email: person.email, dienstName: art?.name ?? "Helfer", vereinName: verein?.name ?? "HandballerPate" };
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungEntferntInhalt(benachrichtigung.dienstName, benachrichtigung.termin),
    };
    try {
      await sendMail(benachrichtigung.email, "Termin-Zuordnung entfernt", terminMailText(mailParams), terminMailHtml(mailParams));
    } catch (err) {
      console.error("Entfernungs-Mail (eigener Dienst) konnte nicht gesendet werden:", err);
    }
  }
  aktualisiereSeiten();
}

// Bedarf eines eigenen Dienstes für genau diesen Termin (auch 0); leeres Feld = wieder der Standard des Dienstes.
export async function dienstBedarfSetzen(formData: FormData) {
  const { vereinId } = await pruefeDienstwart();
  const terminId = text(formData, "terminId");
  const dienstArtId = text(formData, "dienstArtId");
  const roh = text(formData, "bedarf");
  const bedarf = roh === "" ? null : pruefeBedarf(roh);

  await withTenant(vereinId, async (tx) => {
    const termin = await tx.query.termine.findFirst({ where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)) });
    const art = await tx.query.dienstArten.findFirst({
      where: and(eq(dienstArten.id, dienstArtId), eq(dienstArten.vereinId, vereinId)),
    });
    if (!termin || !art) throw new Error("Termin oder Dienst nicht gefunden.");

    if (bedarf != null) {
      const [{ anzahl }] = await tx
        .select({ anzahl: count() })
        .from(terminZuordnungen)
        .where(and(eq(terminZuordnungen.terminId, terminId), eq(terminZuordnungen.dienstArtId, dienstArtId)));
      if (anzahl > bedarf) {
        throw new Error(`Es sind schon ${anzahl} Personen eingeteilt. Bitte erst Einteilungen entfernen oder einen höheren Bedarf wählen.`);
      }
    }

    await tx
      .delete(terminDienstBedarf)
      .where(and(eq(terminDienstBedarf.terminId, terminId), eq(terminDienstBedarf.dienstArtId, dienstArtId)));
    if (bedarf != null) {
      await tx.insert(terminDienstBedarf).values({ terminId, dienstArtId, vereinId, bedarf });
    }
  });
  aktualisiereSeiten();
}
