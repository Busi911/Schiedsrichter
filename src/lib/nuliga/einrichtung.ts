import "server-only";
import { count, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, vereine } from "@/db/schema";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { uebernehmeLigaSpiele } from "@/lib/liga-uebernahme";
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
}): Promise<EinrichtungsSchritt[]> {
  const { vereinId, clubId } = opt;
  const ligaVerein = await legeLigaVereinAn(adminDb, { vereinId, nuligaClubId: clubId, name: opt.indexName });

  // Vereinsseite (Stammdaten, Hallen): Fehler hier verhindern die Einrichtung nie.
  let info: VereinsInfo | null = null;
  let infoFehler: string | null = null;
  let seitenKontext: SeitenKontext | undefined;
  try {
    const seite = await holeNuligaSeiteMitKontext(baueNuligaUrl("HHV", "clubInfoDisplay", { club: clubId }));
    seitenKontext = seite.kontext;
    const geparst = parseVereinsInfo(seite.html);
    info = geparst.daten;
    if (geparst.warnungen.length) infoFehler = geparst.warnungen[0];
  } catch (err) {
    infoFehler = err instanceof Error ? err.message : String(err);
  }
  if (info) await speichereStammdaten(adminDb, ligaVerein.id, info);

  // Spielhallen nur setzen, wenn der Verein noch keine eingetragen hat.
  const hallen = info?.hallen ?? [];
  const [v] = await adminDb
    .select({ hallen: vereine.eigeneHallenNamen, uebernahme: vereine.ligaUebernahmeAktiv })
    .from(vereine)
    .where(eq(vereine.id, vereinId));
  let hallenGespeichert = hallen;
  if (hallen.length > 0 && !v?.hallen?.trim()) {
    await adminDb.update(vereine).set({ eigeneHallenNamen: hallen.join(", ").slice(0, 500) }).where(eq(vereine.id, vereinId));
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
  if (v && !v.uebernahme) {
    schritte.push({ schluessel: "uebernahme", label: "Automatische Übernahme", status: "pruefen", detail: "ist für diesen Verein ausgeschaltet — Verlegungen und neue Spiele kommen erst nach dem Einschalten unter /system/abgleich" });
  }
  return schritte;
}
