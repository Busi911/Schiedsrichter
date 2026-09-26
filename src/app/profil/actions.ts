"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { syncSchiedsrichterIcsFeed } from "@/lib/ics-sync";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { SELBST_ANMELDBARE_TYPEN } from "@/lib/eigene-offene-dienste";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { pruefeEmailVerfuegbar } from "@/lib/email-aendern";
import { sendMail } from "@/lib/mailer";
import { holeOrdnerwarteEmails, ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { appUrl } from "@/lib/app-url";
import { istSchiedsrichterwart } from "@/lib/schiedsrichterwart";
import { holeZeitnehmerwarteEmails, istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import {
  abmeldungAngefragtInhalt,
  pruefeBesetzungsgrenze,
  pruefeKeineDoppelrolle,
} from "@/lib/zuordnung";

// Selbstverwaltung der eigenen Stammdaten (Name, Telefonnummer) — die
// E-Mail-Adresse (login-kritisch) läuft bewusst über einen eigenen Flow mit
// Bestätigungslink, siehe emailAendernAnfordern unten.
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailAenderungBestaetigenInhalt(
  neueEmail: string,
  bestaetigungsUrl: string
): EmailInhalt {
  return {
    ueberschrift: "E-Mail-Adresse bestätigen",
    zeilen: [
      `Du hast angefordert, dich künftig mit ${neueEmail} einzuloggen.`,
      "Falls das nicht du warst, ignoriere diese Mail einfach — es ändert sich dann nichts.",
    ],
    cta: { text: "E-Mail-Adresse bestätigen", url: bestaetigungsUrl },
  };
}

// Stößt eine E-Mail-Änderung an (siehe Kommentar bei updateStammdaten) — wird
// erst nach Klick auf den Bestätigungslink in profil/email-bestaetigen/
// [token]/actions.ts tatsächlich übernommen, damit nicht versehentlich ein
// Tippfehler oder eine fremde Adresse als neuer Login landet, ohne dass
// deren Besitzer zugestimmt hat (anders als beim Admin-Pendant
// updateFunktionstraeger, das sofort ändert — der Admin trägt dort bereits
// Verantwortung für die Richtigkeit).
export async function emailAendernAnfordern(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const neueEmailRoh = formData.get("neueEmail");
  if (typeof neueEmailRoh !== "string" || !neueEmailRoh.trim()) {
    throw new Error("E-Mail-Adresse ist erforderlich.");
  }
  const neueEmail = neueEmailRoh.trim().toLowerCase();
  if (!EMAIL_REGEX.test(neueEmail)) {
    throw new Error("Das ist keine gültige E-Mail-Adresse.");
  }

  const ergebnis = await withTenant(vereinId, async (tx) => {
    const bestehend = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!bestehend) throw new Error("Person nicht gefunden.");
    if (neueEmail === bestehend.email) {
      throw new Error("Das ist bereits deine aktuelle E-Mail-Adresse.");
    }
    await pruefeEmailVerfuegbar(tx, neueEmail, userId);

    const token = crypto.randomUUID();
    await tx
      .update(users)
      .set({
        pendingEmail: neueEmail,
        pendingEmailToken: token,
        // 48h — großzügig genug für "Mail erst am nächsten Tag gesehen",
        // aber kein dauerhaft gültiger Link, falls die Mail irgendwo liegen
        // bleibt.
        pendingEmailTokenAblaufAm: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })
      .where(eq(users.id, userId));

    return { token };
  });

  try {
    const bestaetigungsUrl = `${appUrl()}/profil/email-bestaetigen/${ergebnis.token}`;
    const inhalt = emailAenderungBestaetigenInhalt(neueEmail, bestaetigungsUrl);
    await sendMail(
      neueEmail,
      "E-Mail-Adresse bestätigen",
      emailAlsText(inhalt),
      emailAlsHtml(inhalt)
    );
  } catch (err) {
    console.error("Bestätigungs-Mail für E-Mail-Änderung fehlgeschlagen:", err);
    throw new Error(
      "Bestätigungs-Mail konnte nicht gesendet werden. Bitte später erneut versuchen."
    );
  }

  revalidatePath("/profil");
}

// Bricht eine über emailAendernAnfordern gestartete, noch nicht bestätigte
// Änderung ab (z.B. Tippfehler bemerkt, oder die Mail kam nie an).
export async function emailAenderungAbbrechen() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  await withTenant(vereinId, (tx) =>
    tx
      .update(users)
      .set({
        pendingEmail: null,
        pendingEmailToken: null,
        pendingEmailTokenAblaufAm: null,
      })
      .where(eq(users.id, userId))
  );

  revalidatePath("/profil");
}

// Aktiviert (falls noch kein Token vorhanden: /kalender/[token]) bzw.
// generiert einen neuen persönlichen Kalender-Abo-Link — dieselbe Funktion
// für "erstmals aktivieren" und "Link neu generieren" (der alte Link wird
// dabei ungültig), analog zu zeitnehmerSelbstanmeldungLinkErneuern in
// profil/zeitnehmerwart/actions.ts.
export async function kalenderLinkErneuern() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  await withTenant(vereinId, (tx) =>
    tx
      .update(users)
      .set({ kalenderToken: crypto.randomUUID() })
      .where(eq(users.id, userId))
  );

  revalidatePath("/profil");
}

export async function kalenderLinkDeaktivieren() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  await withTenant(vereinId, (tx) =>
    tx.update(users).set({ kalenderToken: null }).where(eq(users.id, userId))
  );

  revalidatePath("/profil");
}

// Selbstverwaltung der drei Erinnerungs-Mails (siehe wochen-digest.ts,
// terminerinnerungen.ts, schiedsrichterwart-erinnerung.ts) — Checkboxen
// senden bei "aus" gar kein Feld, daher jeweils "on"-Vergleich statt eines
// booleschen Werts.
export async function updateBenachrichtigungen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const wochenDigestAktiviert = formData.get("wochenDigestAktiviert") === "on";
  const terminErinnerungAktiviert = formData.get("terminErinnerungAktiviert") === "on";

  // Der Schiedsrichterwart-Schalter erscheint im Formular nur, wenn die
  // Person aktuell Schiedsrichterwart ist (siehe profil/page.tsx) — ohne
  // diese Prüfung würde ein Absenden des Formulars ohne diesen Schalter
  // (z.B. von jemandem ohne diese Rolle) das Feld stumm auf false
  // zurücksetzen, statt es einfach unverändert zu lassen. Vor withTenant
  // aufgerufen, damit istSchiedsrichterwart nicht in einer verschachtelten
  // Transaktion läuft (es öffnet selbst eine eigene withTenant-Transaktion).
  const [darfSchiedsrichterwartFeldAendern, darfZeitnehmerwartFeldAendern] =
    await Promise.all([
      istSchiedsrichterwart(vereinId, userId),
      istZeitnehmerwart(vereinId, userId),
    ]);

  const werteZumSpeichern: Partial<typeof users.$inferInsert> = {
    wochenDigestAktiviert,
    terminErinnerungAktiviert,
  };
  if (darfSchiedsrichterwartFeldAendern) {
    werteZumSpeichern.offeneSchiedsrichterErinnerungAktiviert =
      formData.get("offeneSchiedsrichterErinnerungAktiviert") === "on";
  }
  if (darfZeitnehmerwartFeldAendern) {
    werteZumSpeichern.offeneZeitnehmerErinnerungAktiviert =
      formData.get("offeneZeitnehmerErinnerungAktiviert") === "on";
  }

  await withTenant(vereinId, (tx) =>
    tx.update(users).set(werteZumSpeichern).where(eq(users.id, userId))
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
    const mannschaft = termin.mannschaftId
      ? await tx.query.mannschaften.findFirst({
          where: eq(mannschaften.id, termin.mannschaftId),
        })
      : null;

    // Zeitnehmer/Sekretär haben eine feste Obergrenze von je 1 (siehe
    // pruefeBesetzungsgrenze/pruefeKeineDoppelrolle in zuordnung.ts, dieselbe
    // Prüfung wie bei der öffentlichen Selbsteintragung) statt der
    // konfigurierbaren Bedarfsgrenze der Ordner-Rollen unten.
    if (rolle === "zeitnehmer" || rolle === "sekretaer") {
      await pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle);
      await pruefeKeineDoppelrolle(tx, terminId, { userId });

      // bedarfFuer liefert für zeitnehmer/sekretaer den KOMBINIERTEN
      // Mindestbedarf (siehe berechneBesetzung), keine Obergrenze pro
      // Rolle — die kommt bereits über pruefeBesetzungsgrenze. Hier zählt
      // nur der Sonderfall 0 (Bedarf für diesen Termin/diese Mannschaft
      // ausdrücklich abgeschaltet, siehe zeitnehmerBedarfOverride/
      // mannschaftZeitnehmerBedarfDeaktiviert): ohne diese Prüfung konnte
      // sich jemand per manipuliertem Request trotzdem eintragen.
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        rolle,
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        termin.zeitnehmerBedarfOverride,
        mannschaftBedarfDeaktiviertFuer(mannschaft, rolle)
      );
      if (bedarf <= 0) {
        throw new Error("Für diesen Termin ist dieser Dienst nicht vorgesehen.");
      }
    } else {
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        rolle,
        termin.pflichtspiel,
        termin.freundschaftsTyp,
        undefined,
        mannschaftBedarfDeaktiviertFuer(mannschaft, rolle)
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
    }

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "selbst_angemeldet",
    });
  });

  revalidatePath("/profil");
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

// Entfernt die Zuordnung NICHT direkt, sondern markiert sie nur als
// Abmeldeanfrage (terminZuordnungen.abmeldungAngefragtAm) und benachrichtigt
// den zuständigen Wart — sonst verschwindet eine Zuordnung stillschweigend,
// ohne dass der Wart die entstehende Lücke bemerkt. Der Wart entscheidet
// über abmeldungGenehmigen/abmeldungAblehnen (profil/ordnerwart/actions.ts
// bzw. profil/zeitnehmerwart/actions.ts). Ein erneuter Klick auf eine
// bereits angefragte Abmeldung zieht die Anfrage wieder zurück, statt einen
// zweiten Hinweis an den Wart zu schicken.
export async function selbstAbmelden(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  const anfrage = await withTenant(vereinId, async (tx) => {
    // Sicherheitscheck: nur die eigene Anmeldung darf abgemeldet werden.
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (!zuordnung || zuordnung.userId !== userId) return null;

    if (zuordnung.abmeldungAngefragtAm) {
      await tx
        .update(terminZuordnungen)
        .set({ abmeldungAngefragtAm: null })
        .where(eq(terminZuordnungen.id, zuordnungId));
      return null;
    }

    await tx
      .update(terminZuordnungen)
      .set({ abmeldungAngefragtAm: new Date() })
      .where(eq(terminZuordnungen.id, zuordnungId));

    const [termin, verein, nutzer] = await Promise.all([
      tx.query.termine.findFirst({ where: eq(termine.id, zuordnung.terminId) }),
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }),
      tx.query.users.findFirst({ where: eq(users.id, userId) }),
    ]);
    if (!termin || !verein || !nutzer) return null;

    return { termin, verein, nutzer, rolle: zuordnung.funktionstraegerTyp };
  });

  if (anfrage) {
    const { termin, verein, nutzer, rolle } = anfrage;
    const istOrdnerFamilie = (ORDNER_ROLLEN as readonly string[]).includes(rolle);
    const warte = istOrdnerFamilie
      ? await holeOrdnerwarteEmails(vereinId)
      : await holeZeitnehmerwarteEmails(vereinId);
    const wartUrl = `${appUrl()}${istOrdnerFamilie ? "/profil/ordnerwart" : "/profil/zeitnehmerwart"}`;
    const inhalt = {
      vereinName: verein.name,
      ...abmeldungAngefragtInhalt(nutzer.name ?? nutzer.email, rolle, termin, {
        text: "Abmeldung bestätigen",
        url: wartUrl,
      }),
    };
    for (const wart of warte) {
      try {
        await sendMail(
          wart.email,
          "Abmeldeanfrage",
          emailAlsText(inhalt),
          emailAlsHtml(inhalt)
        );
      } catch (err) {
        console.error("Abmeldeanfrage-Mail konnte nicht gesendet werden:", err);
      }
    }
  }

  revalidatePath("/profil");
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
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
