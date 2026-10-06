"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, nuligaVereinsindex, vereine, vereinKontakt } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import {
  beendeTreuhand,
  loescheVorbereitungsVerein,
  starteTreuhand,
  uebergebeVerein,
  vereinVorbereiten as vereinVorbereitenLib,
} from "@/lib/treuhand";
import { erzeugeVorschauLink, widerrufeVorschauLink } from "@/lib/verein-vorschau";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { uebergabeInhalt } from "@/lib/uebergabe-mail";
import { holeNuligaBild, holeNuligaHtml, holeNuligaSeiteMitKontext, type SeitenKontext } from "@/lib/nuliga/client";
import { uebernehmeNuligaLogo, type LogoErgebnis } from "@/lib/nuliga/logo";
import { baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { parseVereinsInfo } from "@/lib/nuliga/parsers/vereinsinfo";
import { aktualisiereVereinsindex } from "@/lib/nuliga/vereinsindex";
import { bewerteEinrichtung } from "@/lib/nuliga/einrichtung-status";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { uebernehmeLigaSpiele } from "@/lib/liga-uebernahme";
import { schreibeProtokoll } from "@/lib/treuhand";
import { normalisiereInstagram } from "@/lib/verein-ansprache";

export async function vereinErstellen(formData: FormData) {
  await requireSystemAdmin();

  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");

  if (
    typeof vereinsname !== "string" ||
    !vereinsname.trim() ||
    typeof adminName !== "string" ||
    !adminName.trim() ||
    typeof adminEmail !== "string" ||
    !adminEmail.trim()
  ) {
    throw new Error("Bitte alle Felder ausfüllen.");
  }

  await legeVereinMitAdminAn(vereinsname, adminName, adminEmail);

  revalidatePath("/system/vereine");
}

const text = (formData: FormData, name: string) => {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert.trim() : "";
};

// Verein ohne Admin anlegen und direkt zum Einrichten wechseln.
export async function vereinVorbereiten(formData: FormData) {
  const session = await requireSystemAdmin();
  const id = await vereinVorbereitenLib(session.user.id, text(formData, "vereinsname"));
  await starteTreuhand(session.user.id, id, "einrichtung");
  redirect("/admin");
}

// Wechsel in einen Verein: im Vorbereitungs-Modus zum Einrichten, sonst nur
// mit gültiger Support-Freigabe des Vereins (prüft starteTreuhand).
export async function treuhandStarten(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (!v) throw new Error("Verein nicht gefunden.");
  await starteTreuhand(
    session.user.id,
    vereinId,
    v.status === "vorbereitung" ? "einrichtung" : "support"
  );
  redirect("/admin");
}

// "Zurück ins System" (Banner im Admin-Bereich).
export async function treuhandBeenden() {
  const session = await requireSystemAdmin();
  await beendeTreuhand(session.user.id);
  redirect("/system/vereine");
}

// Übergabe an den echten Vereinsadmin: danach hat der Systemadmin keinen
// Zugriff mehr auf den Verein.
export async function vereinUebergeben(formData: FormData) {
  const session = await requireSystemAdmin();
  const { vereinName, adminEmail } = await uebergebeVerein(
    session.user.id,
    text(formData, "vereinId"),
    text(formData, "adminName"),
    text(formData, "adminEmail")
  );
  // Erst nach der Übergabe (Verein ist jetzt aktiv, die Mail-Sperre gilt nicht
  // mehr). Scheitert der Versand, bleibt die Übergabe bestehen.
  try {
    const inhalt = uebergabeInhalt(vereinName, adminEmail);
    await sendMail(
      adminEmail,
      `Dein Verein ${vereinName} ist eingerichtet`,
      emailAlsText(inhalt),
      emailAlsHtml(inhalt)
    );
  } catch (err) {
    console.error("Übergabe-Mail konnte nicht gesendet werden:", err);
  }
  revalidatePath("/system/vereine");
  redirect("/system/vereine");
}

// Geheimer Vorschau-Link für einen Verein in Vorbereitung (Demo für Dritte).
export async function vorschauLinkErzeugen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (v?.status !== "vorbereitung") throw new Error("Nur für Vereine in Vorbereitung.");
  await erzeugeVorschauLink(vereinId, Number(text(formData, "tage")), session.user.email ?? session.user.id);
  revalidatePath("/system/vereine");
}

export async function vorschauLinkWiderrufen(formData: FormData) {
  const session = await requireSystemAdmin();
  await widerrufeVorschauLink(text(formData, "linkId"), session.user.email ?? session.user.id);
  revalidatePath("/system/vereine");
}

// Verein in Vorbereitung endgültig löschen (z.B. Test oder Abbruch). Übergebene Vereine nie.
export async function vorbereitungsVereinLoeschen(formData: FormData) {
  const session = await requireSystemAdmin();
  await loescheVorbereitungsVerein(session.user.id, text(formData, "vereinId"));
  revalidatePath("/system/vereine");
}

// Vereinsindex von Hand neu laden (sonst täglich per Cron).
export async function vereinsindexAktualisieren() {
  await requireSystemAdmin();
  const r = await aktualisiereVereinsindex({ db: adminDb, holeHtml: holeNuligaHtml, frist: Date.now() + 50_000 });
  const params = new URLSearchParams({
    index: `${r.vereine} Vereine aus ${r.regionen} Bezirken${r.vollstaendig ? "" : " (unvollständig, bitte erneut)"}${r.warnungen.length ? ` · ${r.warnungen[0]}` : ""}`,
  });
  revalidatePath("/system/vereine");
  redirect(`/system/vereine?${params.toString()}`);
}

// Verein aus dem nuLiga-Index im Hintergrund einrichten (Vorbereitung, unsichtbar, keine Mails): Verein
// anlegen, Vereinsseite lesen (Hallen), Mannschaften/Spiele laden, Termine anlegen — und eine Checkliste
// liefern, was automatisch geklappt hat und was ein Mensch prüfen muss. Nichts davon ist öffentlich,
// bis der Verein übergeben wird.
export async function vereinAusNuligaEinrichten(formData: FormData) {
  const session = await requireSystemAdmin();
  const clubId = text(formData, "clubId");
  const [eintrag] = await adminDb
    .select()
    .from(nuligaVereinsindex)
    .where(and(eq(nuligaVereinsindex.verband, "HHV"), eq(nuligaVereinsindex.clubId, clubId)));
  if (!eintrag) throw new Error("Verein nicht im Index gefunden.");
  const schonDa = await adminDb.query.ligaVereine.findFirst({
    where: and(eq(ligaVereine.verband, "HHV"), eq(ligaVereine.nuligaClubId, clubId)),
    columns: { id: true },
  });
  if (schonDa) throw new Error("Dieser Verein ist bereits eingerichtet.");

  const vereinId = await vereinVorbereitenLib(session.user.id, eintrag.name);
  const ligaVerein = await legeLigaVereinAn(adminDb, { vereinId, nuligaClubId: clubId, name: eintrag.name });

  // Vereinsseite (Stammdaten, Hallen): Fehler hier verhindern die Einrichtung nie.
  let info = null;
  let infoFehler: string | null = null;
  let seitenKontext: SeitenKontext | undefined;
  try {
    const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl("HHV", "clubInfoDisplay", { club: clubId }));
    const html = seite.html;
    seitenKontext = seite.kontext;
    const geparst = parseVereinsInfo(html);
    info = geparst.daten;
    if (geparst.warnungen.length) infoFehler = geparst.warnungen[0];
  } catch (err) {
    infoFehler = err instanceof Error ? err.message : String(err);
  }
  const hallen = info?.hallen ?? [];
  if (hallen.length > 0) {
    await adminDb.update(vereine).set({ eigeneHallenNamen: hallen.join(", ").slice(0, 500) }).where(eq(vereine.id, vereinId));
  }

  // Logo gleich mit, als Teil desselben Vereinsobjekts (Pfad aus der AKTUELLEN Seite, nie gemerkt).
  let logo: LogoErgebnis | null = null;
  if (info) {
    logo = await uebernehmeNuligaLogo({ db: adminDb, ligaVereinId: ligaVerein.id, logoPfad: info.logoPfad, holeBild: holeNuligaBild, kontext: seitenKontext });
  }

  const start = Date.now();
  const sync = await synchronisiereAlleQuellen(ligaVerein.id, {
    db: adminDb,
    holeHtml: holeNuligaHtml,
    holeJson: holeHandballNetApi,
    frist: start + 35_000,
  });
  const [{ anzahl }] = await adminDb.select({ anzahl: count() }).from(ligaMannschaften).where(eq(ligaMannschaften.ligaVereinId, ligaVerein.id));

  let termineAngelegt: number | null = null;
  if (hallen.length > 0 && Date.now() < start + 45_000) {
    try {
      termineAngelegt = (await uebernehmeLigaSpiele(vereinId, "Einrichtung")).angelegt;
    } catch (err) {
      console.error("Termin-Übernahme bei der automatischen Einrichtung fehlgeschlagen:", err);
    }
  }

  const schritte = bewerteEinrichtung({
    indexName: eintrag.name,
    clubId,
    info,
    infoFehler,
    hallenGespeichert: hallen,
    syncStatus: sync.status,
    syncUnvollstaendig: sync.unvollstaendig,
    syncMeldungen: sync.meldungen,
    mannschaften: anzahl,
    termineAngelegt,
    logo,
    logoSicher: info?.logoSicher ?? false,
  });
  await schreibeProtokoll(
    vereinId,
    "einrichtung_automatisch",
    session.user.email ?? session.user.id,
    schritte.map((x) => `${x.label}: ${x.status}`).join("; ")
  );
  revalidatePath("/system/vereine");
  const params = new URLSearchParams({ einrichtung: JSON.stringify({ verein: eintrag.name, vereinId, schritte }) });
  redirect(`/system/vereine?${params.toString()}`);
}

// Ansprache eines Vereins in Vorbereitung (Instagram von Hand, siehe lib/verein-ansprache.ts): interne Notizen
// des Systemadmins, nie für den Verein sichtbar (Tabelle verein_kontakt, nur adminDb).
async function pruefeVorbereitung(vereinId: string) {
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (v?.status !== "vorbereitung") throw new Error("Nur für Vereine in Vorbereitung.");
}

export async function kontaktSpeichern(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  await pruefeVorbereitung(vereinId);
  const roh = text(formData, "instagram");
  const instagram = roh ? normalisiereInstagram(roh)?.name : null;
  if (roh && !instagram) throw new Error("Der Instagram-Name ist ungültig (nur Buchstaben, Ziffern, Punkt, Unterstrich).");
  const notiz = text(formData, "notiz").slice(0, 1000) || null;
  await adminDb
    .insert(vereinKontakt)
    .values({ vereinId, instagram: instagram ?? null, notiz })
    .onConflictDoUpdate({ target: vereinKontakt.vereinId, set: { instagram: instagram ?? null, notiz } });
  revalidatePath("/system/vereine");
  void session;
}

export async function kontaktAngeschrieben(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  const zuruecksetzen = text(formData, "zuruecksetzen") === "1";
  await pruefeVorbereitung(vereinId);
  const angeschriebenAm = zuruecksetzen ? null : new Date();
  await adminDb
    .insert(vereinKontakt)
    .values({ vereinId, angeschriebenAm })
    .onConflictDoUpdate({ target: vereinKontakt.vereinId, set: { angeschriebenAm } });
  await schreibeProtokoll(
    vereinId,
    zuruecksetzen ? "ansprache_zurueckgesetzt" : "ansprache_angeschrieben",
    session.user.email ?? session.user.id,
    zuruecksetzen ? undefined : "Instagram (von Hand)"
  );
  revalidatePath("/system/vereine");
}
