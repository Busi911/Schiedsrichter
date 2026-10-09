import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine } from "@/db/schema";
import { appUrl } from "./app-url";
import { BETA_ENDE_MARKE, BETA_ERSTE_FRIST, betragNetto, KARENZ_TAGE, sollBetaEndeMailSenden, sollMailSenden, stufeFuer, zahlungsMarke, zahlungsStand, ZAHLUNGS_TEXT, type ZahlungsStufe } from "./abrechnung";
import { BETA_ENDE, KONTAKT_EMAIL, NETTO, PREIS_BETA, PREIS_REGULAER } from "./beta-konditionen";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatum } from "./format";
import { sendMail } from "./mailer";
import { schreibeProtokoll } from "./treuhand";

// Zahlungs-Mails (täglicher Cron /api/cron/zahlung). Je Periode und Stufe EINMAL (Marke am Verein): 1 = Periode/Frist läuft in höchstens 30 Tagen ab
// bzw. die erste Rechnung ist fällig, 2 = überfällig, 3 = gesperrt. Die Systemadmins bekommen jede Stufe (damit sie die Rechnung rechtzeitig stellen),
// der Verein die Stufen mit Hinweis auf Rechnung bzw. Sperre. Kein Verein mit Sponsor (der Sponsor zahlt) und kein befreiter Verein bekommt Mails.
// Diese Mails sind bewusst NICHT abbestellbar (Rechnungs-/Vertragsthema).

type Zeile = typeof vereine.$inferSelect;

const euro = (n: number) => `${n.toLocaleString("de-DE")} €`;

function rechnungsZeilen(v: Zeile): string[] {
  const adresse = [v.strasse, [v.plz, v.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [
    `Verein: ${v.name}`,
    `Tarif: ${v.tarif === "beta" ? "Beta-Tester" : "Regulär"}${v.sponsorUebernimmt ? " · Sponsor übernimmt alles" : ""} — ${euro(betragNetto(v.tarif, v.sponsorUebernimmt))} netto im Jahr`,
    `Rechnung an: ${v.rechnungAnsprechpartner ?? "—"}, ${v.rechnungEmail ?? "(keine Rechnungs-E-Mail hinterlegt)"}`,
    `Anschrift: ${adresse || "(keine Anschrift hinterlegt)"}`,
  ];
}

export function systemAdminInhalt(v: Zeile, stufe: ZahlungsStufe, faelligAm: Date, sperreAb: Date): EmailInhalt {
  const ueberschrift =
    stufe === 1
      ? v.zahlungBis
        ? `Neue Zahlungsperiode beginnt bald: ${v.name}`
        : `Erste Rechnung fällig: ${v.name}`
      : stufe === 2
        ? `Zahlung überfällig: ${v.name}`
        : `Zugang gesperrt: ${v.name}`;
  return {
    ueberschrift,
    zeilen: [
      ...rechnungsZeilen(v),
      v.zahlungBis ? `Bezahlt bis: ${formatDatum(v.zahlungBis)}` : `Zahlungsziel: ${formatDatum(faelligAm)}`,
      stufe === 1
        ? "Bitte die Rechnung stellen und nach Zahlungseingang unter „Abrechnung“ als bezahlt eintragen."
        : stufe === 2
          ? `Gesperrt wird am ${formatDatum(sperreAb)}, wenn bis dahin nichts bezahlt ist (unter „Abrechnung“ aussetzbar).`
          : "Der Zugang des Vereins ist gesperrt. Mit „Als bezahlt markieren“ ist er sofort wieder frei.",
    ],
    cta: { text: "Zur Abrechnung", url: `${appUrl()}/system/abrechnung` },
  };
}

export function vereinInhalt(v: Zeile, stufe: ZahlungsStufe, faelligAm: Date, sperreAb: Date): EmailInhalt {
  const betrag = euro(betragNetto(v.tarif, v.sponsorUebernimmt));
  const an = v.rechnungEmail ?? "eure Admin-E-Mail-Adresse";
  return {
    vereinName: v.name,
    ueberschrift:
      stufe === 1
        ? v.zahlungBis
          ? `Eure Zahlungsperiode endet am ${formatDatum(v.zahlungBis)}.`
          : "Eure Rechnung folgt in Kürze."
        : stufe === 2
          ? "Die Zahlung ist überfällig."
          : "Der Zugang ist gesperrt.",
    zeilen:
      stufe === 1
        ? [
            `Die Rechnung über ${betrag} netto (12 Monate HandballerPate) geht per E-Mail an ${an}.`,
            `Zahlungsziel: ${formatDatum(faelligAm)}.`,
            `Falls ihr HandballerPate nicht weiter nutzen wollt, gebt uns bitte vorher kurz Bescheid (${KONTAKT_EMAIL}): Dann wird alles gelöscht und es fällt nichts an.`,
          ]
        : stufe === 2
          ? [
              `Die Rechnung über ${betrag} netto war bis ${formatDatum(faelligAm)} fällig.`,
              `Bitte zahlt bis ${formatDatum(sperreAb)}, sonst wird der Zugang für euren Verein gesperrt. Bei Fragen: ${KONTAKT_EMAIL}.`,
            ]
          : [`Der Zugang ist gesperrt, weil die Zahlung noch aussteht. Sobald sie eingegangen ist, wird er wieder freigeschaltet. Bei Fragen: ${KONTAKT_EMAIL}.`],
  };
}

// Ankündigung vor dem Beta-Ende: was ab wann gilt, was passiert, wenn nicht gezahlt wird, und wie der Verein stattdessen aussteigt.
export function betaEndeInhalt(v: Zeile): EmailInhalt {
  const sperre = formatDatum(new Date(BETA_ERSTE_FRIST.getTime() + KARENZ_TAGE * 24 * 3600 * 1000));
  return {
    vereinName: v.name,
    ueberschrift: `Die Beta-Phase von HandballerPate endet am ${BETA_ENDE}.`,
    zeilen: [
      `Danach ist HandballerPate kostenpflichtig. Weil ihr in der Beta-Phase dabei seid, zahlt ihr ${euro(PREIS_BETA)} statt ${euro(PREIS_REGULAER)} im Jahr (netto). ${NETTO}`,
      `Die Rechnung geht ab dem 01.12.2026 per E-Mail an ${v.rechnungEmail ?? "eure Admin-E-Mail-Adresse"}, Zahlungsziel ist der ${formatDatum(BETA_ERSTE_FRIST)}. Ihr müsst nichts weiter tun.`,
      `Wird die Rechnung nicht bezahlt, wird der Zugang für euren Verein deaktiviert (frühestens am ${sperre}). Eure Daten bleiben dabei erhalten; sobald die Zahlung eingegangen ist, ist der Zugang sofort wieder frei.`,
      `Ihr wollt HandballerPate nicht weiter nutzen? Dann löscht euren Verein bitte vor dem ${BETA_ENDE}, dann fällt nichts an: Als Admin unter Einstellungen ganz unten bei „Gefahrenzone“ auf „Verein löschen“ gehen und den Vereinsnamen eintippen. Dabei werden alle Daten unwiderruflich gelöscht. Alternativ schreibt uns kurz an ${KONTAKT_EMAIL}, dann übernehmen wir das.`,
      `Rechnungsadresse und -E-Mail könnt ihr unter Einstellungen → „Vereinsdaten und Rechnung“ prüfen. Bei Fragen: ${KONTAKT_EMAIL}.`,
    ],
    cta: { text: "Zu den Einstellungen", url: `${appUrl()}/admin/einstellungen` },
  };
}

async function sende(to: string, betreff: string, inhalt: EmailInhalt) {
  try {
    await sendMail(to, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
    return true;
  } catch (err) {
    console.error("Zahlungs-Mail fehlgeschlagen:", err);
    return false;
  }
}

async function vereinsEmpfaenger(v: Zeile): Promise<string[]> {
  const admins = await adminDb.select({ email: users.email }).from(users).where(and(eq(users.vereinId, v.id), eq(users.istAdmin, true)));
  return [...new Set([...admins.map((a) => a.email), ...(v.rechnungEmail ? [v.rechnungEmail] : [])].map((e) => e.toLowerCase()))];
}

export function zahlungBestaetigungInhalt(v: Zeile, bis: Date): EmailInhalt {
  return {
    vereinName: v.name,
    ueberschrift: "Eure Zahlung ist eingegangen.",
    zeilen: [`Vielen Dank! Der Zugang für ${v.name} ist jetzt bis ${formatDatum(bis)} bezahlt.`, `Bei Fragen: ${KONTAKT_EMAIL}.`],
  };
}

// Kurze Bestätigung, wenn der Systemadmin "bezahlt" erfasst hat. Nicht für befreite und Sponsor-Vereine (wie die übrigen Zahlungs-Mails); gibt die Zahl der Mails zurück.
export async function sendeZahlungBestaetigung(vereinId: string): Promise<number> {
  try {
    const v = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
    if (!v || !v.zahlungBis || v.tarif === "befreit" || v.sponsorUebernimmt || v.status !== "aktiv") return 0;
    const inhalt = zahlungBestaetigungInhalt(v, v.zahlungBis);
    let n = 0;
    for (const e of await vereinsEmpfaenger(v)) if (await sende(e, `HandballerPate: ${inhalt.ueberschrift}`, inhalt)) n++;
    return n;
  } catch (err) {
    console.error("Zahlungs-Bestätigung fehlgeschlagen:", err);
    return 0;
  }
}

export async function pruefeZahlungen(jetzt = new Date()): Promise<{ geprueft: number; gesendet: number }> {
  const alle = await adminDb.select().from(vereine).where(and(eq(vereine.status, "aktiv"), ne(vereine.tarif, "befreit")));
  const systemAdmins = await adminDb.select({ email: users.email }).from(users).where(eq(users.istSystemAdmin, true));
  let gesendet = 0;
  for (const v of alle) {
    if (sollBetaEndeMailSenden(v, jetzt)) {
      const inhalt = betaEndeInhalt(v);
      const empfaenger = await vereinsEmpfaenger(v);
      let ok = 0;
      for (const e of empfaenger) if (await sende(e, `HandballerPate: ${inhalt.ueberschrift}`, inhalt)) ok++;
      if (ok > 0) {
        gesendet += ok;
        await adminDb.update(vereine).set({ zahlungMailMarke: BETA_ENDE_MARKE }).where(eq(vereine.id, v.id));
        await schreibeProtokoll(v.id, "zahlung_mail", "System", "Ankündigung Beta-Ende");
      }
      continue;
    }
    const stand = zahlungsStand(v, jetzt);
    const stufe = stufeFuer(stand.art);
    if (!stufe || !stand.faelligAm || !stand.sperreAb) continue;
    if (!sollMailSenden(v.zahlungMailMarke, stand.faelligAm, stufe)) continue;

    for (const a of systemAdmins) if (await sende(a.email, `Zahlung: ${v.name} — ${ZAHLUNGS_TEXT[stand.art]}`, systemAdminInhalt(v, stufe, stand.faelligAm, stand.sperreAb))) gesendet++;
    if (!v.sponsorUebernimmt) {
      const empfaenger = await vereinsEmpfaenger(v);
      for (const e of empfaenger) if (await sende(e, `HandballerPate: ${vereinInhalt(v, stufe, stand.faelligAm, stand.sperreAb).ueberschrift}`, vereinInhalt(v, stufe, stand.faelligAm, stand.sperreAb))) gesendet++;
    }
    await adminDb.update(vereine).set({ zahlungMailMarke: zahlungsMarke(stand.faelligAm, stufe) }).where(eq(vereine.id, v.id));
    await schreibeProtokoll(v.id, "zahlung_mail", "System", `Stufe ${stufe} (${ZAHLUNGS_TEXT[stand.art]}), fällig ${formatDatum(stand.faelligAm)}`);
  }
  return { geprueft: alle.length, gesendet };
}
