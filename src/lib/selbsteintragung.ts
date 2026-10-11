import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, vereine } from "@/db/schema";
import {
  loeseIdentitaetPerEmailAuf,
  mehrfachZuordnungsMailInhalt,
  neueSelbstregistrierungInhalt,
  sendeMailAnAlle,
  type SelbstEintragenIdentitaet,
  zuordnungFehlgeschlagenInhalt,
} from "@/lib/zuordnung";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { requireSession } from "@/lib/session";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { appUrl } from "@/lib/app-url";
import { formatDatumZeit } from "@/lib/format";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];
type Termin = typeof termine.$inferSelect;
type Person = { userId: string } | { externerName: string };

// Die öffentliche Selbsteintragung für Zeitnehmer/Sekretär und für Ordner/Kioskdienst/Kassierer ist EINE Logik (Token statt Session, Namensabgleich,
// eigene Transaktion je Termin, Fehler als Rückgabewert statt Wurf). Der Bereich legt nur fest, was sich wirklich unterscheidet: Rollen, Token-Spalte,
// Kandidaten/Warte-Adressen, Besetzungs- und Doppelrollen-Prüfung (Zeitnehmer/Sekretär: harte Sperre; Ordner: nur Warnung bei anderer Ordner-Rolle).
export type SelbsteintragungBereich = {
  rollen: readonly string[];
  tokenSpalte: typeof vereine.zeitnehmerSelbstanmeldungToken | typeof vereine.ordnerSelbstanmeldungToken;
  // Alter Pfad (leitet auf /eintragen/[token] um) und Wart-Seite — nur für revalidatePath und den Link in der Fehler-Mail.
  alterPfad: string;
  wartSeite: string;
  wartLabel: string; // z.B. "Zeitnehmerwart"
  uebersichtLabel: string; // Text des Links in der Fehler-Mail
  holeKandidaten: (vereinId: string) => Promise<{ userId: string; email: string; name: string | null; rollen: readonly string[] }[]>;
  holeWarteEmails: (vereinId: string) => Promise<{ email: string }[]>;
  pruefeBesetzung: (tx: Tx, vereinId: string, terminId: string, termin: Termin, rolle: string) => Promise<void>;
  // Wirft bei hartem Verstoß; gibt sonst eine Warnung (oder null) zurück.
  pruefeDoppelrolle: (tx: Tx, terminId: string, person: Person, rolle: string) => Promise<{ warnung: string | null }>;
};

function ergebnisFehler(gesamt: number, fehler: string): MehrfachEintragErgebnis {
  return { eingetragen: 0, gesamt, fehler };
}

export async function selbstEintragenMehrfachOeffentlich(
  b: SelbsteintragungBereich,
  formData: FormData
): Promise<MehrfachEintragErgebnis> {
  const token = formData.get("token");
  const terminIds = formData.getAll("terminIds").filter((v): v is string => typeof v === "string" && !!v);
  const name = formData.get("name");
  const emailRoh = formData.get("email");
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) return ergebnisFehler(0, "Ungültiger Link.");
  if (terminIds.length === 0) return ergebnisFehler(0, "Bitte mindestens einen Termin auswählen.");
  if (typeof name !== "string" || !name.trim()) return ergebnisFehler(terminIds.length, "Name ist erforderlich.");
  if (typeof rolleRoh !== "string" || !b.rollen.includes(rolleRoh)) {
    return ergebnisFehler(terminIds.length, "Bitte eine Rolle auswählen.");
  }
  const rolle = rolleRoh;
  const eingegebenerName = name.trim();
  let eingegebeneEmail = typeof emailRoh === "string" ? emailRoh.trim().toLowerCase() : "";

  // Bewusst adminDb nur für den Token-Lookup (keine Session/vereinId vorhanden), danach ausschließlich withTenant.
  const verein = await adminDb.query.vereine.findFirst({ where: eq(b.tokenSpalte, token) });
  if (!verein) return ergebnisFehler(terminIds.length, "Ungültiger oder nicht mehr aktiver Link.");
  // Der Link des öffentlichen Demo-Vereins ist öffentlich: eine E-Mail würde hier sonst Konten mit fremden Adressen anlegen und über die Meldung "bereits
  // einem anderen Verein zugeordnet" verraten, welche Adressen bei uns registriert sind. In der Demo zählt deshalb nur der Name.
  if (verein.istDemo) eingegebeneEmail = "";

  let identitaet: SelbstEintragenIdentitaet;
  let warNeuRegistriert = false;
  if (eingegebeneEmail) {
    try {
      ({ identitaet, warNeuRegistriert } = await loeseIdentitaetPerEmailAuf(
        verein.id,
        eingegebeneEmail,
        eingegebenerName,
        rolle as Parameters<typeof loeseIdentitaetPerEmailAuf>[3]
      ));
    } catch (err) {
      return ergebnisFehler(terminIds.length, err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
    }
  } else {
    // AUSSERHALB der Transaktionen geladen, da die Kandidatenabfrage selbst withTenant nutzt (keine verschachtelten Transaktionen).
    const kandidaten = (await b.holeKandidaten(verein.id)).filter((k) => k.rollen.includes(rolle));
    const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);
    identitaet = exakt
      ? { art: "userId", userId: exakt.userId, email: kandidaten.find((k) => k.userId === exakt.userId)?.email ?? "" }
      : { art: "extern", externerName: eingegebenerName, matchVorschlagUserId: vorschlag?.userId ?? null };
  }

  const eingetrageneTermine: { start: Date; ort: string | null; beschreibung: string | null }[] = [];
  const fehler: string[] = [];
  const warnungen: string[] = [];

  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(verein.id, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        let warnung: string | null = null;
        try {
          await b.pruefeBesetzung(tx, verein.id, terminId, termin, rolle);
          ({ warnung } = await b.pruefeDoppelrolle(
            tx,
            terminId,
            identitaet.art === "userId" ? { userId: identitaet.userId } : { externerName: identitaet.externerName },
            rolle
          ));
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."}`
          );
        }

        await tx.insert(terminZuordnungen).values({
          terminId,
          userId: identitaet.art === "userId" ? identitaet.userId : null,
          externerName: identitaet.art === "extern" ? identitaet.externerName : null,
          matchVorschlagUserId: identitaet.art === "extern" ? identitaet.matchVorschlagUserId : null,
          funktionstraegerTyp: rolle as typeof terminZuordnungen.$inferInsert.funktionstraegerTyp,
          quelle: "selbst_eingetragen_oeffentlich",
        });
        if (warnung) warnungen.push(`${formatDatumZeit(termin.start)}: ${warnung}`);
        return termin;
      });
      if (termin) eingetrageneTermine.push(termin);
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : "Unbekannter Fehler.");
    }
  }

  // Hier hat möglicherweise eine ANDERE Person den Namen eingetragen — wie bei jeder Fremdzuordnung eine Benachrichtigung, gebündelt in EINER Mail.
  if (identitaet.art === "userId" && identitaet.email && eingetrageneTermine.length > 0) {
    const mailParams = { vereinName: verein.name, ...mehrfachZuordnungsMailInhalt(rolle, eingetrageneTermine) };
    try {
      await sendMail(identitaet.email, "Neue Termin-Zuordnungen", terminMailText(mailParams), terminMailHtml(mailParams));
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  if (warNeuRegistriert) {
    const warte = await b.holeWarteEmails(verein.id);
    if (warte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...neueSelbstregistrierungInhalt(eingegebenerName, eingegebeneEmail, rolle, {
          text: "Zur Funktionsträger-Verwaltung",
          // ?suche füllt die Suche direkt mit der E-Mail, sonst müsste der Wart die neu registrierte Person erst suchen.
          url: `${appUrl()}/admin/funktionstraeger?suche=${encodeURIComponent(eingegebeneEmail)}`,
        }),
      };
      await sendeMailAnAlle(
        warte,
        "Neue Selbstregistrierung wartet auf Freischaltung",
        inhalt,
        `Registrierungs-Mail an ${b.wartLabel} konnte nicht gesendet werden`
      );
    }
  }

  // Fehlgeschlagene Termine sieht die eintragende Person direkt, meldet sich aber nicht zwangsläufig beim Wart — der erfährt es sonst nicht.
  if (fehler.length > 0) {
    const warte = await b.holeWarteEmails(verein.id);
    if (warte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...zuordnungFehlgeschlagenInhalt(eingegebenerName, rolle, fehler, {
          text: b.uebersichtLabel,
          url: `${appUrl()}${b.wartSeite}`,
        }),
      };
      await sendeMailAnAlle(warte, "Selbsteintragung fehlgeschlagen", inhalt, `Fehlschlags-Mail an ${b.wartLabel} konnte nicht gesendet werden`);
    }
  }

  revalidatePath(`${b.alterPfad}/${token}`);
  revalidatePath(b.wartSeite);
  revalidatePath("/admin/funktionstraeger");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
    ...(warnungen.length > 0 ? { warnung: warnungen.join(" | ") } : {}),
  };
}

// Variante für eine erkannte, eingeloggte Session: keine Namens-/E-Mail-Eingabe, die Identität kommt aus der Session. Eine fehlende Rolle wird SOFORT
// aktiv angelegt (eine eingeloggte Person ist ein verifiziertes Vereinsmitglied), bewusst ohne Bestätigungs-Mail an die Person selbst. Zusätzlich zum
// Token muss die Person zu DIESEM Verein gehören, sonst könnte eine fremde Session einen fremden Link missbrauchen.
export async function selbstEintragenMehrfachEingeloggt(
  b: SelbsteintragungBereich,
  formData: FormData
): Promise<MehrfachEintragErgebnis> {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const token = formData.get("token");
  const terminIds = formData.getAll("terminIds").filter((v): v is string => typeof v === "string" && !!v);
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) return ergebnisFehler(0, "Ungültiger Link.");
  if (terminIds.length === 0) return ergebnisFehler(0, "Bitte mindestens einen Termin auswählen.");
  if (typeof rolleRoh !== "string" || !b.rollen.includes(rolleRoh)) {
    return ergebnisFehler(terminIds.length, "Bitte eine Rolle auswählen.");
  }
  const rolle = rolleRoh as typeof funktionstraegerRollen.$inferInsert.typ;

  const verein = await adminDb.query.vereine.findFirst({ where: eq(b.tokenSpalte, token) });
  if (!verein || verein.id !== vereinId) return ergebnisFehler(terminIds.length, "Ungültiger Link oder falscher Verein.");

  await withTenant(vereinId, async (tx) => {
    const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(eq(funktionstraegerRollen.userId, userId), eq(funktionstraegerRollen.typ, rolle)),
    });
    if (!vorhandeneRolle) {
      await tx.insert(funktionstraegerRollen).values({ userId, typ: rolle, aktiv: true });
    } else if (!vorhandeneRolle.aktiv) {
      await tx.update(funktionstraegerRollen).set({ aktiv: true }).where(eq(funktionstraegerRollen.id, vorhandeneRolle.id));
    }
  });

  let eingetragen = 0;
  const fehler: string[] = [];
  const warnungen: string[] = [];

  for (const terminId of terminIds) {
    try {
      await withTenant(vereinId, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        let warnung: string | null = null;
        try {
          await b.pruefeBesetzung(tx, vereinId, terminId, termin, rolle);
          ({ warnung } = await b.pruefeDoppelrolle(tx, terminId, { userId }, rolle));
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."}`
          );
        }

        await tx.insert(terminZuordnungen).values({ terminId, userId, funktionstraegerTyp: rolle, quelle: "selbst_angemeldet" });
        if (warnung) warnungen.push(`${formatDatumZeit(termin.start)}: ${warnung}`);
      });
      eingetragen++;
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : "Unbekannter Fehler.");
    }
  }

  revalidatePath(`${b.alterPfad}/${token}`);
  revalidatePath(b.wartSeite);
  revalidatePath("/profil");
  revalidatePath("/admin/kalender");

  return {
    eingetragen,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
    ...(warnungen.length > 0 ? { warnung: warnungen.join(" | ") } : {}),
  };
}
