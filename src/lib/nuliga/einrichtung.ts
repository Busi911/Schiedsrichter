import "server-only";
import { and, count, eq, like } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, termine, vereine } from "@/db/schema";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { uebernehmeLigaSpiele } from "@/lib/liga-uebernahme";
import { schreibeProtokoll } from "@/lib/treuhand";
import { holeNuligaBild, holeNuligaHtml, holeNuligaSeiteMitKontext, type SeitenKontext } from "./client";
import { bewerteEinrichtung, type EinrichtungsSchritt } from "./einrichtung-status";
import { uebernehmeNuligaLogo, type LogoErgebnis } from "./logo";
import { legeVereinsMannschaftenAn } from "./mannschaften-anlegen";
import { parseVereinsInfo } from "./parsers/vereinsinfo";
import { speichereStammdaten } from "./stammdaten";
import { legeLigaVereinAn } from "./sync";
import { baueNuligaUrl } from "./verbaende";
import type { VereinsInfo } from "./types";

// Der gemeinsame Ablauf der automatischen Einrichtung aus nuLiga für EINEN registrierten Verein (Vorbereitung oder bereits aktiv):
// Liga-Verein mit club-ID anlegen, Vereinsseite lesen (Stammdaten, Hallen, Logo), Mannschaften/Spiele laden, Vereins-Mannschaften
// anlegen, Heimspiele als Termine anlegen. Alles still (keine Mails). Nicht zerstörend: vorhandene Spielhallen werden NIE überschrieben,
// Mannschaften nur ergänzt (siehe mannschaften-anlegen.ts), ein eigenes Logo bleibt (siehe logo.ts). Gibt die Checkliste zurück.
export async function fuehreNuligaEinrichtungAus(opt: {
  vereinId: string;
  clubId: string;
  indexName: string;
  verband?: string;
}): Promise<EinrichtungsSchritt[]> {
  const { vereinId, clubId } = opt;
  const verband = opt.verband ?? "HHV";
  const ligaVerein = await legeLigaVereinAn(adminDb, { vereinId, nuligaClubId: clubId, name: opt.indexName, verband });

  // Vereinsseite (Stammdaten, Hallen): Fehler hier verhindern die Einrichtung nie.
  let info: VereinsInfo | null = null;
  let infoFehler: string | null = null;
  let seitenKontext: SeitenKontext | undefined;
  try {
    const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl(verband, "clubInfoDisplay", { club: clubId }));
    seitenKontext = seite.kontext;
    const geparst = parseVereinsInfo(seite.html);
    info = geparst.daten;
    if (geparst.warnungen.length) infoFehler = geparst.warnungen[0];
  } catch (err) {
    infoFehler = err instanceof Error ? err.message : String(err);
  }
  if (info) await speichereStammdaten(adminDb, ligaVerein.id, info);

  // Spielhallen nur setzen, wenn der Verein noch keine eingetragen hat.
  // Hallen ohne HHV-Spielbetrieb ("… (Aktuell kein HHV-Spielbetrieb)") tragen keine Spiele aus und stören nur.
  const hallen = (info?.hallen ?? []).filter((h) => !/kein\s+HHV-Spielbetrieb/i.test(h));
  const [v] = await adminDb
    .select({ hallen: vereine.eigeneHallenNamen, uebernahme: vereine.ligaUebernahmeAktiv })
    .from(vereine)
    .where(eq(vereine.id, vereinId));
  let hallenGespeichert = hallen;
  if (hallen.length > 0 && !v?.hallen?.trim()) {
    await adminDb.update(vereine).set({ eigeneHallenNamen: hallen.join("\n").slice(0, 500) }).where(eq(vereine.id, vereinId));
  } else if (v?.hallen?.trim()) {
    hallenGespeichert = [];
  }
  const vorhandeneHallen = !!v?.hallen?.trim();

  let logo: LogoErgebnis | null = null;
  if (info) {
    logo = await uebernehmeNuligaLogo({ db: adminDb, ligaVereinId: ligaVerein.id, logoPfad: info.logoPfad, holeBild: holeNuligaBild, kontext: seitenKontext });
  }

  const start = Date.now();
  const sync = await synchronisiereAlleQuellen(ligaVerein.id, { db: adminDb, holeHtml: holeNuligaHtml, holeJson: holeHandballNetApi, frist: start + 35_000 });
  const [{ anzahl }] = await adminDb.select({ anzahl: count() }).from(ligaMannschaften).where(eq(ligaMannschaften.ligaVereinId, ligaVerein.id));

  const mannschaftenErgebnis = await legeVereinsMannschaftenAn(adminDb, vereinId);

  // Die Starthilfe soll alles in Gang setzen: Verlegungen, Ergebnisse und neue Spiele kommen dann von selbst. Nur wenn der Verein
  // schon Termine aus dem Hallenplan-Import hat, bleibt die Übernahme aus — die müssen erst unter /system/abgleich verknüpft werden.
  let uebernahmeEingeschaltet = false;
  if (v && !v.uebernahme) {
    const [{ importiert }] = await adminDb
      .select({ importiert: count() })
      .from(termine)
      .where(and(eq(termine.vereinId, vereinId), like(termine.icsUid, "rundenspiel:%")));
    if (Number(importiert) === 0) {
      await adminDb.update(vereine).set({ ligaUebernahmeAktiv: true }).where(eq(vereine.id, vereinId));
      await schreibeProtokoll(vereinId, "liga_uebernahme_an", "Einrichtung", "Automatische Übernahme bei der Starthilfe eingeschaltet");
      uebernahmeEingeschaltet = true;
    }
  }

  let termineAngelegt: number | null = null;
  if ((hallen.length > 0 || vorhandeneHallen) && Date.now() < start + 45_000) {
    try {
      termineAngelegt = (await uebernehmeLigaSpiele(vereinId, "Einrichtung")).angelegt;
    } catch (err) {
      console.error("Termin-Übernahme bei der automatischen Einrichtung fehlgeschlagen:", err);
    }
  }

  const schritte = bewerteEinrichtung({
    indexName: opt.indexName,
    clubId,
    info,
    infoFehler,
    hallenGespeichert,
    hallenBereitsVorhanden: vorhandeneHallen && hallen.length > 0,
    syncStatus: sync.status,
    syncUnvollstaendig: sync.unvollstaendig,
    syncMeldungen: sync.meldungen,
    mannschaften: anzahl,
    mannschaftenAngelegt: mannschaftenErgebnis.angelegt,
    mannschaftenModus: mannschaftenErgebnis.modus,
    termineAngelegt,
    logo,
    logoSicher: info?.logoSicher ?? false,
  });
  if (uebernahmeEingeschaltet) {
    schritte.push({ schluessel: "uebernahme", label: "Automatische Übernahme", status: "ok", detail: "eingeschaltet — Verlegungen, Ergebnisse und neue Spiele kommen von selbst" });
  } else if (v && !v.uebernahme) {
    schritte.push({ schluessel: "uebernahme", label: "Automatische Übernahme", status: "pruefen", detail: "bleibt aus, weil der Verein schon Termine aus dem Hallenplan-Import hat — erst unter /system/abgleich verknüpfen und dann einschalten; ist für diesen Verein ausgeschaltet — Verlegungen und neue Spiele kommen erst nach dem Einschalten unter /system/abgleich" });
  }
  return schritte;
}
