import "server-only";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, nuligaVereinsindex, vereine, vereinKontakt, vereinVorschauLinks } from "@/db/schema";
import { erzeugeVorschauLink } from "./verein-vorschau";
import { fuehreNuligaEinrichtungAus } from "./nuliga/einrichtung";
import { schreibeProtokoll } from "./treuhand";
import { holeNuligaSeiteMitKontext } from "./nuliga/client";
import { baueNuligaUrl } from "./nuliga/verbaende";
import { parseVereinsInfo } from "./nuliga/parsers/vereinsinfo";
import { speichereStammdaten } from "./nuliga/stammdaten";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText } from "./email-layout";
import { outreachInhalt } from "./outreach-mail";
import { outreachAbmeldeUrl } from "./outreach-abmelden";
import { outreachUebergabeUrl } from "./outreach-uebergabe";
import { extrahiereKontaktEmail } from "./nuliga/outreach-kontakt";
import { scrapeImpressum } from "./impressum";
import { appUrl } from "./app-url";

// Shared E-Mail-Extraktion für Outreach: nuLiga-Kontakt → Impressum der
// Vereinswebsite → Impressum der E-Mail-Domain. Gibt die beste gefundene
// E-Mail zurück (oder null). Die Reihenfolge:
// 1. nuLiga-Kontaktadresse (encodeEmail-Decodierung + mailto:)
// 2. Impressum der Vereinswebsite (wenn nuLiga eine Website liefert)
// 3. Wenn nuLiga eine E-Mail, aber keine Website liefert: Domain der
//    nuLiga-E-Mail als Website versuchen → deren Impressum (§ 5 TMG).
//    Die Impressum-Adresse ist per TMG veröffentlicht und eher erreichbar
//    als die nuLiga-Adresse (die ein generisches Postfach sein kann).
// Bekannte Freemail-/Webmail-Provider — deren Domain als Website zu scrapen macht
// keinen Sinn (es ist die Homepage des Providers, nicht die des Vereins).
const FREEMAIL_DOMAINS = [
  "web.de", "gmx.de", "gmx.net", "t-online.de", "gmail.com", "googlemail.com",
  "yahoo.de", "yahoo.com", "hotmail.de", "hotmail.com", "outlook.de", "outlook.com",
  "live.de", "live.com", "msn.com", "aol.de", "aol.com", "freenet.de", "1und1.de",
  "mail.de", "posteo.de", "web.de", "arcor.de", "unity-mail.de",
];

async function extrahiereOutreachEmail(seiteHtml: string): Promise<string | null> {
  const geparst = parseVereinsInfo(seiteHtml);
  const website = geparst.daten?.website;
  // Website-Domain als Hint: wenn mehrere Kontakt-Adressen auf der nuLiga-Seite
  // stehen, bevorzugen wir die, deren Domain zur Vereins-Website passt.
  const websiteDomain = website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() ?? undefined;
  let kontaktEmail = extrahiereKontaktEmail(seiteHtml, websiteDomain);

  // 2. Fallback: Impressum der Vereinswebsite.
  if (!kontaktEmail && website) {
    try {
      const impressum = await scrapeImpressum(website);
      kontaktEmail = impressum.email;
    } catch {}
  }

  // 3. Fallback: E-Mail-Domain als Website.
  if (kontaktEmail && !website) {
    const domain = kontaktEmail.split("@")[1];
    if (domain && !domain.endsWith("liga.nu") && !domain.endsWith("handball.net") && !FREEMAIL_DOMAINS.includes(domain)) {
      try {
        const impressum = await scrapeImpressum(`https://${domain}`);
        if (impressum.email) {
          kontaktEmail = impressum.email;
        }
      } catch {}
    }
  }

  return kontaktEmail;
}

const OUTREACH_KONSTANTEN = {
  // Ziel: 5 erfolgreich angeschriebene Vereine pro Lauf. Die Kandidaten-Query
  // holt bis zu MAX_VERSUCH_PRO_LAUF Vereine — viele fallen durch (keine
  // E-Mail, 0 Mannschaften nach Einrichtung), deshalb probieren wir mehr,
  // bis ZIEL_ANGESCHRIEBEN erreicht ist. Anti-Spam-Limit bleibt bei 5 Mails.
  ZIEL_ANGESCHRIEBEN: 5,
  MAX_VERSUCH_PRO_LAUF: 25,
  VORSCHAU_TAGE: 7,
  FOLLOWUP_TAGE: 7,
};

export type OutreachErgebnis = {
  verarbeitet: number;
  angeschrieben: number;
  keineEmail: number;
  schonEingerichtet: number;
  fehler: number;
  details: {
    name: string;
    clubId: string;
    status: "angeschrieben" | "keine_email" | "fehler" | "schon_eingerichtet";
    email?: string;
    fehler?: string;
  }[];
};

export type OutreachFollowupErgebnis = {
  versendet: number;
  fehler: number;
  details: { name: string; email: string; status: "gesendet" | "fehler" }[];
};

// Hauptfunktion des Outreach-Crons: Findet neue Vereine aus dem nuLiga-Index,
// die noch nicht in der App existieren, richtet sie ein, sucht die E-Mail aus
// dem Impressum und sendet die Ansprache-Mail.
export async function fuehreOutreachAus(verband?: string): Promise<OutreachErgebnis> {
  const ergebnis: OutreachErgebnis = {
    verarbeitet: 0,
    angeschrieben: 0,
    keineEmail: 0,
    schonEingerichtet: 0,
    fehler: 0,
    details: [],
  };

  // 1. Alle Vereine aus dem nuLiga-Index, die noch keinen Eintrag in
  //    liga_vereine haben (also noch nicht eingerichtet wurden), ODER die
  //    einen liga_verein haben, aber noch nicht angeschrieben wurden (Einrichtung
  //    war unvollständig, beim nächsten Lauf erneut versuchen).
  const kandidaten = await adminDb
    .select({
      id: nuligaVereinsindex.id,
      clubId: nuligaVereinsindex.clubId,
      name: nuligaVereinsindex.name,
      bezirk: nuligaVereinsindex.bezirk,
      verband: nuligaVereinsindex.verband,
    })
    .from(nuligaVereinsindex)
    .where(
      sql`(NOT EXISTS (SELECT 1 FROM ${ligaVereine} WHERE ${ligaVereine.nuligaClubId} = ${nuligaVereinsindex.clubId} AND ${ligaVereine.verband} = ${nuligaVereinsindex.verband}) OR EXISTS (SELECT 1 FROM ${ligaVereine} JOIN ${vereine} ON ${vereine.id} = ${ligaVereine.vereinId} LEFT JOIN ${vereinKontakt} ON ${vereinKontakt.vereinId} = ${vereine.id} WHERE ${ligaVereine.nuligaClubId} = ${nuligaVereinsindex.clubId} AND ${ligaVereine.verband} = ${nuligaVereinsindex.verband} AND ${vereine.status} = 'vorbereitung' AND ${vereinKontakt.angeschriebenAm} IS NULL))${verband ? sql` AND ${nuligaVereinsindex.verband} = ${verband}` : sql``}`
    )
    .limit(OUTREACH_KONSTANTEN.MAX_VERSUCH_PRO_LAUF);

  for (const k of kandidaten) {
    if (ergebnis.angeschrieben >= OUTREACH_KONSTANTEN.ZIEL_ANGESCHRIEBEN) break;
    ergebnis.verarbeitet++;
    try {
      // 2. Vereinsseite aus nuLiga laden (für Website, Stammdaten und
      //    Kontaktadresse). Die Seite wird EINMAL geladen und für beide
      //    E-Mail-Quellen genutzt (nuLiga-Kontakt + Website-Impressum).
      const seite = await holeNuligaSeiteMitKontext(
        baueNuligaUrl(k.verband, "clubInfoDisplay", { club: k.clubId })
      );
      const geparst = parseVereinsInfo(seite.html);
      const info = geparst.daten;
      const website = info.website;

      // 3. E-Mail extrahieren: nuLiga-Kontakt → Impressum der Website →
      //    Impressum der E-Mail-Domain (siehe extrahiereOutreachEmail).
      let kontaktEmail = await extrahiereOutreachEmail(seite.html);
      let impressumFehler: string | null = null;

      if (!kontaktEmail) {
        ergebnis.keineEmail++;
        ergebnis.details.push({
          name: k.name,
          clubId: k.clubId,
          status: "keine_email",
          fehler: !website
            ? "Keine Website und keine Kontakt-E-Mail im nuLiga-Eintrag"
            : impressumFehler ?? "Keine E-Mail in nuLiga-Kontakt oder Impressum gefunden",
        });
        continue;
      }

      // 4. Verein in der App anlegen (Status "vorbereitung") — falls er
      //    noch nicht existiert (beim Retry ist er schon angelegt).
      const [bestehend] = await adminDb
        .select({ id: vereine.id })
        .from(vereine)
        .innerJoin(ligaVereine, eq(ligaVereine.vereinId, vereine.id))
        .where(and(eq(ligaVereine.nuligaClubId, k.clubId), eq(ligaVereine.verband, k.verband)));

      const vereinId = bestehend?.id ?? (
        await adminDb
          .insert(vereine)
          .values({ name: k.name, status: "vorbereitung" })
          .returning({ id: vereine.id })
      )[0].id;

      // 5. Automatisch einrichten (Mannschaften, Hallen, Logo, Liga-Verein).
      //    Beim Retry: nicht zerstörend, ergänzt nur (siehe einrichtung.ts).
      try {
        await fuehreNuligaEinrichtungAus({
          vereinId,
          clubId: k.clubId,
          indexName: k.name,
          verband: k.verband,
        });
      } catch (err) {
        await schreibeProtokoll(vereinId, "outreach_einrichtung_fehler", "Outreach-Cron", err instanceof Error ? err.message : String(err));
      }

      // 6. Liga-Verein holen (für Slug — brauchen wir für den Vorschau-Link).
      const [ligaV] = await adminDb
        .select({ id: ligaVereine.id, slug: ligaVereine.slug })
        .from(ligaVereine)
        .where(eq(ligaVereine.vereinId, vereinId));

      if (!ligaV) {
        ergebnis.fehler++;
        ergebnis.details.push({
          name: k.name,
          clubId: k.clubId,
          status: "fehler",
          fehler: "Liga-Verein nicht angelegt",
        });
        continue;
      }

      // 6a. Einrichtung vollständig? — wenn keine Mannschaften geladen
      //     wurden, schicken wir keine E-Mail: der Empfänger würde auf eine
      //     leere App schauen. Der nächste Cron-Lauf versucht es erneut
      //     (die Kandidaten-Query findet Vereine mit liga_verein aber ohne
      //     angeschrieben_am automatisch wieder).
      const [{ anzahlMannschaften }] = await adminDb
        .select({ anzahlMannschaften: count() })
        .from(ligaMannschaften)
        .where(eq(ligaMannschaften.ligaVereinId, ligaV.id));

      if (Number(anzahlMannschaften) === 0) {
        await schreibeProtokoll(vereinId, "outreach_einrichtung_unvollstaendig", "Outreach-Cron", `${k.name} · 0 Mannschaften nach Einrichtung — E-Mail nicht gesendet, nächster Lauf versucht es erneut`);
        ergebnis.keineEmail++;
        ergebnis.details.push({
          name: k.name,
          clubId: k.clubId,
          status: "keine_email",
          fehler: "Einrichtung unvollständig — 0 Mannschaften geladen, E-Mail nicht gesendet",
        });
        continue;
      }

      // 7. Vorschau-Link erzeugen (7 Tage).
      await erzeugeVorschauLink(vereinId, OUTREACH_KONSTANTEN.VORSCHAU_TAGE, "Outreach-Cron");
      const [link] = await adminDb
        .select()
        .from(vereinVorschauLinks)
        .where(eq(vereinVorschauLinks.vereinId, vereinId));
      if (!link) {
        ergebnis.fehler++;
        ergebnis.details.push({
          name: k.name,
          clubId: k.clubId,
          status: "fehler",
          fehler: "Vorschau-Link nicht erzeugt",
        });
        continue;
      }

      // 8. Ansprache-Mail generieren und senden.
      const vorschauUrl = `${appUrl()}/verein/${ligaV.slug}/vorschau/${link.token}`;
      const abmeldeUrl = outreachAbmeldeUrl(vereinId);
      const uebergabeUrl = outreachUebergabeUrl(vereinId);
      const istWiederholung = !!bestehend;
      const inhalt = outreachInhalt({
        vereinsname: k.name,
        vorschauUrl,
        gueltigBis: link.gueltigBis,
        email: kontaktEmail,
        abmeldeUrl,
        uebergabeUrl,
        istWiederholung,
      });

      await sendMail(
        kontaktEmail,
        `HandballerPate — eine App für den ${k.name}`,
        emailAlsText(inhalt),
        emailAlsHtml(inhalt),
        { abmeldeUrl }
      );

      // 9. Kontakt protokollieren — anspracheGesendetAm (neu) UND
      //    angeschriebenAm (alt, für die UI: "angeschrieben am …").
      await adminDb
        .insert(vereinKontakt)
        .values({
          vereinId: vereinId,
          anspracheKanal: "email",
          anspracheEmail: kontaktEmail,
          anspracheGesendetAm: new Date(),
          angeschriebenAm: new Date(),
        })
        .onConflictDoUpdate({
          target: vereinKontakt.vereinId,
          set: {
            anspracheKanal: "email",
            anspracheEmail: kontaktEmail,
            anspracheGesendetAm: new Date(),
            angeschriebenAm: new Date(),
          },
        });

      await schreibeProtokoll(vereinId, "outreach_angeschrieben", "Outreach-Cron", `${k.name} · E-Mail: ${kontaktEmail} · Vorschau bis ${link.gueltigBis.toISOString()}`);

      ergebnis.angeschrieben++;
      ergebnis.details.push({
        name: k.name,
        clubId: k.clubId,
        status: "angeschrieben",
        email: kontaktEmail,
      });
    } catch (err) {
      ergebnis.fehler++;
      ergebnis.details.push({
        name: k.name,
        clubId: k.clubId,
        status: "fehler",
        fehler: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ergebnis;
}

// Reset eines einzelnen Vereins (über nuLiga club ID): löscht den Verein
// samt allen Daten (Kaskade) und führt den Outreach für diesen einen Club
// neu aus — mit dem korrigierten E-Mail-Decoder. Nur für den manuellen
// Testlauf gedacht (temporärer ?reset=clubId Parameter).
export async function resetOutreachVerein(clubId: string): Promise<{ geloescht: boolean; neu: boolean; email: string | null; fehler: string | null }> {
  // 1. Bestehenden Verein mit dieser nuligaClubId finden und löschen.
  const [bestehend] = await adminDb
    .select({ vereinId: ligaVereine.vereinId, id: ligaVereine.id, verband: ligaVereine.verband })
    .from(ligaVereine)
    .where(eq(ligaVereine.nuligaClubId, clubId));

  if (bestehend) {
    await adminDb.delete(vereine).where(eq(vereine.id, bestehend.vereinId));
  }

  // 2. nuLiga-Vereinsseite laden und E-Mail extrahieren.
  const [eintrag] = await adminDb
    .select()
    .from(nuligaVereinsindex)
    .where(eq(nuligaVereinsindex.clubId, clubId));

  if (!eintrag) return { geloescht: !!bestehend, neu: false, email: null, fehler: "Verein nicht im nuLiga-Index gefunden" };

  const verband = eintrag.verband ?? bestehend?.verband ?? "HHV";
  const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl(verband, "clubInfoDisplay", { club: clubId }));
  const kontaktEmail = await extrahiereOutreachEmail(seite.html);

  if (!kontaktEmail) return { geloescht: !!bestehend, neu: false, email: null, fehler: "Keine E-Mail nach Reset gefunden" };

  // 3. Verein neu anlegen und Outreach durchführen.
  const [neu] = await adminDb.insert(vereine).values({ name: eintrag.name, status: "vorbereitung" }).returning({ id: vereine.id });

  try {
    await fuehreNuligaEinrichtungAus({ vereinId: neu.id, clubId, indexName: eintrag.name, verband });
  } catch (err) {
    await schreibeProtokoll(neu.id, "outreach_einrichtung_fehler", "Outreach-Reset", err instanceof Error ? err.message : String(err));
  }

  const [ligaV] = await adminDb.select({ id: ligaVereine.id, slug: ligaVereine.slug }).from(ligaVereine).where(eq(ligaVereine.vereinId, neu.id));
  if (!ligaV) return { geloescht: !!bestehend, neu: false, email: kontaktEmail, fehler: "Liga-Verein nicht angelegt" };

  // Einrichtung vollständig? — siehe fuehreOutreachAus (gleicher Check).
  const [{ anzahlMannschaften }] = await adminDb
    .select({ anzahlMannschaften: count() })
    .from(ligaMannschaften)
    .where(eq(ligaMannschaften.ligaVereinId, ligaV.id));
  if (Number(anzahlMannschaften) === 0) {
    await schreibeProtokoll(neu.id, "outreach_einrichtung_unvollstaendig", "Outreach-Reset", `${eintrag.name} · 0 Mannschaften nach Reset — E-Mail nicht gesendet`);
    return { geloescht: !!bestehend, neu: false, email: kontaktEmail, fehler: "Einrichtung unvollständig — 0 Mannschaften geladen, E-Mail nicht gesendet" };
  }

  await erzeugeVorschauLink(neu.id, OUTREACH_KONSTANTEN.VORSCHAU_TAGE, "Outreach-Reset");
  const [link] = await adminDb.select().from(vereinVorschauLinks).where(eq(vereinVorschauLinks.vereinId, neu.id));
  if (!link) return { geloescht: !!bestehend, neu: false, email: kontaktEmail, fehler: "Vorschau-Link nicht erzeugt" };

  const vorschauUrl = `${appUrl()}/verein/${ligaV.slug}/vorschau/${link.token}`;
  const abmeldeUrl = outreachAbmeldeUrl(neu.id);
  const uebergabeUrl = outreachUebergabeUrl(neu.id);
  const inhalt = outreachInhalt({ vereinsname: eintrag.name, vorschauUrl, gueltigBis: link.gueltigBis, email: kontaktEmail, abmeldeUrl, uebergabeUrl });
  await sendMail(kontaktEmail, `HandballerPate — eine App für den ${eintrag.name}`, emailAlsText(inhalt), emailAlsHtml(inhalt), { abmeldeUrl });

  await adminDb
    .insert(vereinKontakt)
    .values({ vereinId: neu.id, anspracheKanal: "email", anspracheEmail: kontaktEmail, anspracheGesendetAm: new Date(), angeschriebenAm: new Date() })
    .onConflictDoUpdate({
      target: vereinKontakt.vereinId,
      set: { anspracheKanal: "email", anspracheEmail: kontaktEmail, anspracheGesendetAm: new Date(), angeschriebenAm: new Date() },
    });

  await schreibeProtokoll(neu.id, "outreach_angeschrieben", "Outreach-Reset", `${eintrag.name} · E-Mail: ${kontaktEmail}`);
  return { geloescht: !!bestehend, neu: true, email: kontaktEmail, fehler: null };
}

// Instagram-Nachfass: Vereine, die per Instagram angeschrieben wurden (angeschrieben_am
// gesetzt, aber keine ansprache_email), die aber bereits Daten haben (Mannschaften > 0).
// Für diese Vereine wird die E-Mail-Adresse aus dem nuLiga-Kontakt extrahiert und
// eine Ansprache-Mail mit Hinweis auf den vorherigen Instagram-Kontakt gesendet.
export async function fuehreInstagramNachfassAus(): Promise<OutreachErgebnis> {
  const ergebnis: OutreachErgebnis = {
    verarbeitet: 0,
    angeschrieben: 0,
    keineEmail: 0,
    schonEingerichtet: 0,
    fehler: 0,
    details: [],
  };

  // Vereine mit Instagram-Ansprache (angeschrieben_am gesetzt, keine E-Mail),
  // Status "vorbereitung", und mit Mannschaften (App nicht leer).
  const kandidaten = await adminDb
    .select({
      id: vereine.id,
      name: vereine.name,
      clubId: ligaVereine.nuligaClubId,
      verband: ligaVereine.verband,
      slug: ligaVereine.slug,
      ligaVereinId: ligaVereine.id,
      mannschaften: sql<number>`(SELECT count(*)::int FROM ${ligaMannschaften} WHERE ${ligaMannschaften.ligaVereinId} = ${ligaVereine.id})`,
    })
    .from(vereine)
    .innerJoin(ligaVereine, eq(ligaVereine.vereinId, vereine.id))
    .innerJoin(vereinKontakt, eq(vereinKontakt.vereinId, vereine.id))
    .where(
      and(
        eq(vereine.status, "vorbereitung"),
        isNull(vereinKontakt.anspracheEmail),
        sql`${vereinKontakt.angeschriebenAm} IS NOT NULL`,
        sql`(SELECT count(*) FROM ${ligaMannschaften} WHERE ${ligaMannschaften.ligaVereinId} = ${ligaVereine.id}) > 0`
      )
    )
    .limit(20);

  for (const k of kandidaten) {
    ergebnis.verarbeitet++;
    try {
      if (!k.clubId) {
        ergebnis.fehler++;
        ergebnis.details.push({ name: k.name, clubId: "", status: "fehler", fehler: "Keine clubId" });
        continue;
      }
      // E-Mail aus nuLiga-Kontaktseite extrahieren (mit Impressum-Fallback).
      const seite = await holeNuligaSeiteMitKontext(
        baueNuligaUrl(k.verband ?? "HHV", "clubInfoDisplay", { club: k.clubId })
      );
      let kontaktEmail = await extrahiereOutreachEmail(seite.html);

      if (!kontaktEmail) {
        ergebnis.keineEmail++;
        ergebnis.details.push({ name: k.name, clubId: k.clubId, status: "keine_email", fehler: "Keine E-Mail in nuLiga oder Impressum" });
        continue;
      }

      // Vorschau-Link erzeugen (7 Tage).
      await erzeugeVorschauLink(k.id, OUTREACH_KONSTANTEN.VORSCHAU_TAGE, "Instagram-Nachfass");
      const [link] = await adminDb.select().from(vereinVorschauLinks).where(eq(vereinVorschauLinks.vereinId, k.id));
      if (!link) {
        ergebnis.fehler++;
        ergebnis.details.push({ name: k.name, clubId: k.clubId, status: "fehler", fehler: "Vorschau-Link nicht erzeugt" });
        continue;
      }

      const vorschauUrl = `${appUrl()}/verein/${k.slug ?? k.id}/vorschau/${link.token}`;
      const abmeldeUrl = outreachAbmeldeUrl(k.id);
      const uebergabeUrl = outreachUebergabeUrl(k.id);
      const inhalt = outreachInhalt({
        vereinsname: k.name,
        vorschauUrl,
        gueltigBis: link.gueltigBis,
        email: kontaktEmail,
        abmeldeUrl,
        uebergabeUrl,
        hatteInstagramKontakt: true,
      });

      await sendMail(
        kontaktEmail,
        `HandballerPate — eine App für den ${k.name}`,
        emailAlsText(inhalt),
        emailAlsHtml(inhalt),
        { abmeldeUrl }
      );

      // Kontakt aktualisieren: E-Mail und Sende-Datum setzen.
      await adminDb
        .update(vereinKontakt)
        .set({ anspracheEmail: kontaktEmail, anspracheGesendetAm: new Date() })
        .where(eq(vereinKontakt.vereinId, k.id));

      await schreibeProtokoll(k.id, "outreach_instagram_nachfass", "Instagram-Nachfass", `${k.name} · E-Mail: ${kontaktEmail}`);
      ergebnis.angeschrieben++;
      ergebnis.details.push({ name: k.name, clubId: k.clubId, status: "angeschrieben", email: kontaktEmail });
    } catch (err) {
      ergebnis.fehler++;
      ergebnis.details.push({ name: k.name, clubId: k.clubId ?? "", status: "fehler", fehler: err instanceof Error ? err.message : String(err) });
    }
  }

  return ergebnis;
}

// Erinnerungsmail senden — genau eine, dann Schluss.
export async function fuehreOutreachFollowupAus(): Promise<OutreachFollowupErgebnis> {
  const ergebnis: OutreachFollowupErgebnis = { versendet: 0, fehler: 0, details: [] };

  // Alle Vereine mit ansprache_gesendet_am, die älter als 7 Tage sind,
  // kein followup gesendet wurde, und die nicht abgemeldet sind.
  const vor7Tagen = new Date(Date.now() - OUTREACH_KONSTANTEN.FOLLOWUP_TAGE * 24 * 60 * 60 * 1000);

  const kandidaten = await adminDb
    .select({
      vereinId: vereinKontakt.vereinId,
      email: vereinKontakt.anspracheEmail,
      gesendetAm: vereinKontakt.anspracheGesendetAm,
    })
    .from(vereinKontakt)
    .where(
      and(
        isNull(vereinKontakt.followupGesendetAm),
        isNull(vereinKontakt.outreachAbgemeldetAm),
        // ansprache_gesendet_am muss gesetzt und älter als 7 Tage sein
        ne(vereinKontakt.anspracheGesendetAm, null as never),
        // Drizzle kann nicht direkt < auf timestamp mit mode date machen,
        // also über sql — aber wir nutzen ne + manuellen Filter:
        ...[]
      )
    );

  // Zweite Stufe: in JS filtern, da Drizzle's timestamp mode=date
  // den < Operator nicht direkt unterstützt.
  const gefiltert = kandidaten.filter(
    (k) => k.gesendetAm && k.gesendetAm < vor7Tagen && k.email
  );

  for (const k of gefiltert) {
    try {
      // Prüfen, ob der Verein bereits übergeben wurde (Status "aktiv").
      const [v] = await adminDb
        .select({ status: vereine.status, name: vereine.name })
        .from(vereine)
        .where(eq(vereine.id, k.vereinId));
      if (!v || v.status === "aktiv") {
        // Verein wurde bereits übergeben — kein Followup nötig.
        continue;
      }

      // Vorschau-Link holen (sollte noch gültig sein oder einen neuen erzeugen).
      const [link] = await adminDb
        .select()
        .from(vereinVorschauLinks)
        .where(eq(vereinVorschauLinks.vereinId, k.vereinId))
        .orderBy(vereinVorschauLinks.gueltigBis)
        .limit(1);

      const [ligaV] = await adminDb
        .select({ slug: ligaVereine.slug })
        .from(ligaVereine)
        .where(eq(ligaVereine.vereinId, k.vereinId));

      if (!link || !ligaV) {
        // Vorschau-Link abgelaufen oder Liga-Verein fehlt — neuen Link erzeugen.
        await erzeugeVorschauLink(k.vereinId, OUTREACH_KONSTANTEN.VORSCHAU_TAGE, "Outreach-Followup");
        const [neuerLink] = await adminDb
          .select()
          .from(vereinVorschauLinks)
          .where(eq(vereinVorschauLinks.vereinId, k.vereinId))
          .orderBy(vereinVorschauLinks.gueltigBis)
          .limit(1);
        if (!neuerLink) continue;

        const vorschauUrl = `${appUrl()}/verein/${ligaV?.slug ?? "verein"}/vorschau/${neuerLink.token}`;
        const abmeldeUrl = outreachAbmeldeUrl(k.vereinId);
        const uebergabeUrl = outreachUebergabeUrl(k.vereinId);
        const inhalt = outreachInhalt({
          vereinsname: v.name,
          vorschauUrl,
          gueltigBis: neuerLink.gueltigBis,
          email: k.email!,
          abmeldeUrl,
          uebergabeUrl,
        });
        await sendMail(
          k.email!,
          `Erinnerung: HandballerPate für den ${v.name}`,
          emailAlsText(inhalt),
          emailAlsHtml(inhalt),
          { abmeldeUrl }
        );
      } else {
        const vorschauUrl = `${appUrl()}/verein/${ligaV.slug}/vorschau/${link.token}`;
        const abmeldeUrl = outreachAbmeldeUrl(k.vereinId);
        const uebergabeUrl = outreachUebergabeUrl(k.vereinId);
        const inhalt = outreachInhalt({
          vereinsname: v.name,
          vorschauUrl,
          gueltigBis: link.gueltigBis,
          email: k.email!,
          abmeldeUrl,
          uebergabeUrl,
        });
        await sendMail(
          k.email!,
          `Erinnerung: HandballerPate für den ${v.name}`,
          emailAlsText(inhalt),
          emailAlsHtml(inhalt),
          { abmeldeUrl }
        );
      }

      await adminDb
        .update(vereinKontakt)
        .set({ followupGesendetAm: new Date() })
        .where(eq(vereinKontakt.vereinId, k.vereinId));

      await schreibeProtokoll(k.vereinId, "outreach_followup", "Outreach-Cron", `Followup an ${k.email}`);

      ergebnis.versendet++;
      ergebnis.details.push({ name: v.name, email: k.email!, status: "gesendet" });
    } catch (err) {
      ergebnis.fehler++;
      ergebnis.details.push({
        name: "",
        email: k.email ?? "",
        status: "fehler",
      });
    }
  }

  return ergebnis;
}
