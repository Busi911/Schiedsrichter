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
import { extrahiereKontaktEmail } from "./nuliga/outreach-kontakt";
import { scrapeImpressum } from "./impressum";
import { appUrl } from "./app-url";

const OUTREACH_KONSTANTEN = {
  MAX_PRO_LAUF: 5,
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
export async function fuehreOutreachAus(): Promise<OutreachErgebnis> {
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
      sql`(
        -- Neu: noch kein liga_verein
        NOT EXISTS (
          SELECT 1 FROM ${ligaVereine} lv
          WHERE ${eq(ligaVereine.nuligaClubId, nuligaVereinsindex.clubId)}
            AND lv.verband = ${nuligaVereinsindex.verband}
        )
        OR (
          -- Oder: liga_verein existiert, aber verein wurde noch nicht
          -- angeschrieben (angeschrieben_am ist NULL) — die Einrichtung war
          -- unvollständig und wird beim nächsten Lauf erneut versucht.
          EXISTS (
            SELECT 1 FROM ${ligaVereine} lv
            JOIN ${vereine} v ON v.id = lv.verein_id
            LEFT JOIN ${vereinKontakt} vk ON vk.verein_id = v.id
            WHERE ${eq(ligaVereine.nuligaClubId, nuligaVereinsindex.clubId)}
              AND lv.verband = ${nuligaVereinsindex.verband}
              AND v.status = 'vorbereitung'
              AND vk.angeschrieben_am IS NULL
          )
        )
      )`
    )
    .limit(OUTREACH_KONSTANTEN.MAX_PRO_LAUF);

  for (const k of kandidaten) {
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

      // 3a. E-Mail aus der nuLiga-Kontaktadresse extrahieren ( primär).
      //     Die nuLiga-Vereinsseite hat oft einen "Kontaktadresse"-Abschnitt
      //     mit E-Mail — das ist die zuverlässigste Quelle.
      let kontaktEmail = extrahiereKontaktEmail(seite.html);

      // 3b. Fallback: E-Mail aus dem Impressum der Vereinswebsite.
      let impressumFehler: string | null = null;
      if (!kontaktEmail && website) {
        try {
          const impressum = await scrapeImpressum(website);
          kontaktEmail = impressum.email;
          if (!impressum.email) impressumFehler = impressum.fehler;
        } catch (err) {
          impressumFehler = err instanceof Error ? err.message : String(err);
        }
      }

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
      const istWiederholung = !!bestehend;
      const inhalt = outreachInhalt({
        vereinsname: k.name,
        vorschauUrl,
        gueltigBis: link.gueltigBis,
        email: kontaktEmail,
        abmeldeUrl,
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
    .select({ vereinId: ligaVereine.vereinId, id: ligaVereine.id })
    .from(ligaVereine)
    .where(and(eq(ligaVereine.nuligaClubId, clubId), eq(ligaVereine.verband, "HHV")));

  if (bestehend) {
    await adminDb.delete(vereine).where(eq(vereine.id, bestehend.vereinId));
  }

  // 2. nuLiga-Vereinsseite laden und E-Mail extrahieren.
  const [eintrag] = await adminDb
    .select()
    .from(nuligaVereinsindex)
    .where(and(eq(nuligaVereinsindex.verband, "HHV"), eq(nuligaVereinsindex.clubId, clubId)));

  if (!eintrag) return { geloescht: !!bestehend, neu: false, email: null, fehler: "Verein nicht im nuLiga-Index gefunden" };

  const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl("HHV", "clubInfoDisplay", { club: clubId }));
  const kontaktEmail = extrahiereKontaktEmail(seite.html);

  if (!kontaktEmail) return { geloescht: !!bestehend, neu: false, email: null, fehler: "Keine E-Mail nach Reset gefunden" };

  // 3. Verein neu anlegen und Outreach durchführen.
  const [neu] = await adminDb.insert(vereine).values({ name: eintrag.name, status: "vorbereitung" }).returning({ id: vereine.id });

  try {
    await fuehreNuligaEinrichtungAus({ vereinId: neu.id, clubId, indexName: eintrag.name });
  } catch (err) {
    await schreibeProtokoll(neu.id, "outreach_einrichtung_fehler", "Outreach-Reset", err instanceof Error ? err.message : String(err));
  }

  const [ligaV] = await adminDb.select({ id: ligaVereine.id, slug: ligaVereine.slug }).from(ligaVereine).where(eq(ligaVereine.vereinId, neu.id));
  if (!ligaV) return { geloescht: !!bestehend, neu: false, email: kontaktEmail, fehler: "Liga-Verein nicht angelegt" };

  await erzeugeVorschauLink(neu.id, OUTREACH_KONSTANTEN.VORSCHAU_TAGE, "Outreach-Reset");
  const [link] = await adminDb.select().from(vereinVorschauLinks).where(eq(vereinVorschauLinks.vereinId, neu.id));
  if (!link) return { geloescht: !!bestehend, neu: false, email: kontaktEmail, fehler: "Vorschau-Link nicht erzeugt" };

  const vorschauUrl = `${appUrl()}/verein/${ligaV.slug}/vorschau/${link.token}`;
  const abmeldeUrl = outreachAbmeldeUrl(neu.id);
  const inhalt = outreachInhalt({ vereinsname: eintrag.name, vorschauUrl, gueltigBis: link.gueltigBis, email: kontaktEmail, abmeldeUrl });
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
        const inhalt = outreachInhalt({
          vereinsname: v.name,
          vorschauUrl,
          gueltigBis: neuerLink.gueltigBis,
          email: k.email!,
          abmeldeUrl,
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
        const inhalt = outreachInhalt({
          vereinsname: v.name,
          vorschauUrl,
          gueltigBis: link.gueltigBis,
          email: k.email!,
          abmeldeUrl,
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
