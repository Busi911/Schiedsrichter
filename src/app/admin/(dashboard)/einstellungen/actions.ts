"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, ligaVereinLogos, ligaVereinZusatzquellen, vereine } from "@/db/schema";
import { ermittleFarbton, LogoFehler, verarbeiteLogo } from "@/lib/liga-logo";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";
import { setzeSupportFreigabe } from "@/lib/treuhand";
import { benachrichtigeSystemAdminsUeberSupportFreigabe } from "@/lib/system-admin-benachrichtigung";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { synchronisiereNuligaHallen } from "@/lib/rundenspiel-sync";
import { signOut } from "@/auth";

function parseAnzahl(formData: FormData, feld: string, min = 0): number {
  const roh = formData.get(feld);
  const zahl = typeof roh === "string" ? Number(roh) : NaN;
  if (!Number.isInteger(zahl) || zahl < min) {
    throw new Error(`Ungültiger Wert für ${feld}.`);
  }
  return zahl;
}

export async function vereinsdatenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const strasse = formData.get("strasse");
  const plz = formData.get("plz");
  const ort = formData.get("ort");
  if (
    typeof strasse !== "string" ||
    typeof plz !== "string" ||
    typeof ort !== "string"
  ) {
    throw new Error("Ungültige Adresse.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        strasse: strasse.trim() || null,
        plz: plz.trim() || null,
        ort: ort.trim() || null,
      })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/admin/einstellungen");
}

export async function dienstBedarfSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const testspielOrdnerBedarf = parseAnzahl(formData, "testspielOrdnerBedarf");
  const testspielKioskdienstBedarf = parseAnzahl(
    formData,
    "testspielKioskdienstBedarf"
  );
  const turnierOrdnerBedarf = parseAnzahl(formData, "turnierOrdnerBedarf");
  const turnierKioskdienstBedarf = parseAnzahl(
    formData,
    "turnierKioskdienstBedarf"
  );
  const rundenspielOrdnerBedarf = parseAnzahl(
    formData,
    "rundenspielOrdnerBedarf"
  );
  const rundenspielKioskdienstBedarf = parseAnzahl(
    formData,
    "rundenspielKioskdienstBedarf"
  );
  const testspielKassiererBedarf = parseAnzahl(formData, "testspielKassiererBedarf");
  const turnierKassiererBedarf = parseAnzahl(formData, "turnierKassiererBedarf");
  const rundenspielKassiererBedarf = parseAnzahl(
    formData,
    "rundenspielKassiererBedarf"
  );
  const testspielZeitnehmerBedarf = parseAnzahl(
    formData,
    "testspielZeitnehmerBedarf"
  );
  const turnierZeitnehmerBedarf = parseAnzahl(
    formData,
    "turnierZeitnehmerBedarf"
  );
  const rundenspielZeitnehmerBedarf = parseAnzahl(
    formData,
    "rundenspielZeitnehmerBedarf"
  );
  const offeneDiensteBroadcastAktiviert =
    formData.get("offeneDiensteBroadcastAktiviert") === "on";

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        testspielOrdnerBedarf,
        testspielKioskdienstBedarf,
        turnierOrdnerBedarf,
        turnierKioskdienstBedarf,
        rundenspielOrdnerBedarf,
        rundenspielKioskdienstBedarf,
        testspielKassiererBedarf,
        turnierKassiererBedarf,
        rundenspielKassiererBedarf,
        testspielZeitnehmerBedarf,
        turnierZeitnehmerBedarf,
        rundenspielZeitnehmerBedarf,
        offeneDiensteBroadcastAktiviert,
      })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/admin/einstellungen");
}

function parseHalleId(formData: FormData, feld: string): string | null {
  const roh = formData.get(feld);
  if (typeof roh !== "string" || !roh.trim()) return null;
  if (!/^\d+$/.test(roh.trim())) {
    throw new Error(`${feld}: bitte nur Zahlen eingeben.`);
  }
  return roh.trim();
}

// Speichert die Hallen-IDs + Aktivierung und stößt sofort einen ersten
// Sync an (statt erst auf den nächsten täglichen Cron zu warten) — direkt
// nach dem Eintragen der IDs will man i.d.R. sofort sehen, dass es
// funktioniert.
export async function nuligaEinstellungenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const nuligaHalle1Id = parseHalleId(formData, "nuligaHalle1Id");
  const nuligaHalle2Id = parseHalleId(formData, "nuligaHalle2Id");
  const nuligaHalle3Id = parseHalleId(formData, "nuligaHalle3Id");
  const nuligaAutoImportAktiviert = formData.get("nuligaAutoImportAktiviert") === "on";
  const rundenspielAenderungenBenachrichtigungAktiviert =
    formData.get("rundenspielAenderungenBenachrichtigungAktiviert") === "on";

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        nuligaHalle1Id,
        nuligaHalle2Id,
        nuligaHalle3Id,
        nuligaAutoImportAktiviert,
        rundenspielAenderungenBenachrichtigungAktiviert,
      })
      .where(eq(vereine.id, vereinId))
  );

  const hallenIds = [nuligaHalle1Id, nuligaHalle2Id, nuligaHalle3Id].filter(
    (id): id is string => id !== null
  );

  const params = new URLSearchParams();
  const [importStatus] = await withTenant(vereinId, (tx) =>
    tx.select({ aus: vereine.hallenplanImportAus }).from(vereine).where(eq(vereine.id, vereinId))
  );
  if (nuligaAutoImportAktiviert && hallenIds.length > 0 && !importStatus?.aus) {
    const ergebnis = await synchronisiereNuligaHallen(vereinId, hallenIds);
    params.set("nuligaNeu", String(ergebnis.neu));
    params.set("nuligaAktualisiert", String(ergebnis.aktualisiert));
    params.set("nuligaEntfernt", String(ergebnis.entfernt));
    const fehlerListe = [
      ...ergebnis.abrufFehler.map(
        (f) => `Halle ${f.locationId} (${f.requestedMonth}): ${f.grund}`
      ),
      ...ergebnis.parseFehler.map((f) => `Eintrag ${f.index}: ${f.grund}`),
    ];
    if (fehlerListe.length) params.set("nuligaFehler", fehlerListe.join(" | "));

    // Diagnose IMMER anzeigen (auch ohne Fehler) — sonst ist "0 Spiele
    // gefunden" von "Seite falsch geparst" nicht zu unterscheiden.
    const statusCodes = [...new Set(ergebnis.diagnose.map((d) => d.httpStatus))];
    const zeilenGesamt = ergebnis.diagnose.reduce((s, d) => s + d.zeilenGefunden, 0);
    const htmlLaengeGesamt = ergebnis.diagnose.reduce((s, d) => s + d.htmlLaenge, 0);
    params.set(
      "nuligaDiagnose",
      `${ergebnis.diagnose.length} Anfragen, HTTP ${statusCodes.join("/") || "—"}, ` +
        `${zeilenGesamt} Tabellenzeilen, ${htmlLaengeGesamt} Zeichen HTML insgesamt`
    );
  }

  revalidatePath("/admin/einstellungen");
  redirect(`/admin/einstellungen?${params.toString()}`);
}

// Namen der eigenen Spielhallen (siehe lib/hallenplan-abgleich.ts, istEigeneHalle):
// eigenes Formular, unabhängig vom (auslaufenden) nuLiga-Hallenplan-Import.
export async function eigeneHallenNamenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const roh = formData.get("eigeneHallenNamen");
  const eigeneHallenNamen = typeof roh === "string" && roh.trim() ? roh.trim().slice(0, 500) : null;
  await withTenant(vereinId, (tx) =>
    tx.update(vereine).set({ eigeneHallenNamen }).where(eq(vereine.id, vereinId))
  );
  revalidatePath("/admin/einstellungen");
  redirect("/admin/einstellungen");
}

// Gefahrenzone: löscht den kompletten Verein UNWIDERRUFLICH — alle
// abhängigen Daten (Funktionsträger, Mannschaften, Hallen, Trainingszeiten,
// Termine, Zuordnungen, ...) hängen per onDelete: cascade an vereine.id
// (siehe db/schema.ts) und verschwinden mit einem einzigen DELETE
// automatisch mit, inklusive der eigenen user-Zeile des ausführenden
// Admins. Deshalb danach zwingend signOut() statt nur redirect() — die
// bestehende JWT-Session verweist sonst auf einen nicht mehr existierenden
// User. Der Vereinsname muss zur Bestätigung exakt eingetippt werden (siehe
// VereinLoeschenDialog), ein einfaches window.confirm() reicht bei diesem
// Ausmaß an Datenverlust nicht.
export async function vereinLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const bestaetigterName = formData.get("bestaetigterVereinsname");
  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
      columns: { name: true },
    })
  );
  if (
    typeof bestaetigterName !== "string" ||
    !verein ||
    bestaetigterName !== verein.name
  ) {
    throw new Error("Vereinsname stimmt nicht überein — nichts gelöscht.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(vereine).where(eq(vereine.id, vereinId))
  );

  await signOut({ redirectTo: "/" });
}

// Öffentliche Vereinsseite (/verein/[slug]): nuLiga-Vereins-ID hinterlegen
// und sofort synchronisieren. Mannschaften/Spielpläne/Tabellen kommen aus
// nuLiga (siehe src/lib/nuliga) und werden danach per Cron aktuell gehalten.
// Höchstzahl automatischer Folgeläufe (je ~45 s): schützt vor Endlosschleifen,
// falls ein Lauf wider Erwarten nie vollständig wird.
const MAX_AUTO_RUNDEN = 6;

export async function oeffentlicheSeiteSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const feld = (n: string) => {
    const roh = formData.get(n);
    return typeof roh === "string" ? roh.trim() : "";
  };
  const clubId = feld("nuligaClubId");
  const handballNetClubId = feld("handballNetClubId");
  const handballNetTeamIds = feld("handballNetTeamIds");
  if (clubId && !/^\d{1,10}$/.test(clubId)) {
    throw new Error("Die nuLiga-Vereins-ID besteht nur aus Ziffern (z.B. 69723).");
  }
  if (handballNetClubId && !/^[a-z0-9]{3,20}$/i.test(handballNetClubId)) {
    throw new Error("Die handball.net-Vereins-ID besteht aus Buchstaben/Ziffern (z.B. 0b8y490).");
  }
  if (handballNetTeamIds && !/^\d+([\s,;]+\d+)*$/.test(handballNetTeamIds)) {
    throw new Error("Team-IDs bitte als Zahlen, durch Komma getrennt (z.B. 69770, 69771).");
  }
  if (!clubId && !handballNetClubId && !handballNetTeamIds) {
    throw new Error("Bitte mindestens eine Vereins-ID (nuLiga oder handball.net) angeben.");
  }

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { name: true } })
  );
  if (!verein) throw new Error("Verein nicht gefunden.");

  const { id } = await legeLigaVereinAn(adminDb, {
    vereinId,
    nuligaClubId: clubId || null,
    handballNetClubId: handballNetClubId || null,
    handballNetTeamIds: handballNetTeamIds || null,
    name: verein.name,
  });
  // Frist deutlich unter maxDuration (60 s der Einstellungsseite): bleibt
  // etwas liegen, endet der Lauf als "teilweise" und ein weiterer Klick (oder
  // der Cron) setzt fort, statt vom Serverless-Limit abgebrochen zu werden.
  const ergebnis = await synchronisiereAlleQuellen(id, {
    db: adminDb,
    holeHtml: holeNuligaHtml,
    holeJson: holeHandballNetApi,
    frist: Date.now() + 45_000,
  });

  const meldungen = ergebnis.meldungen;
  const rundeRoh = Number(formData.get("runde"));
  const runde = Number.isInteger(rundeRoh) && rundeRoh >= 0 ? Math.min(rundeRoh, MAX_AUTO_RUNDEN) : 0;
  const weiter = ergebnis.unvollstaendig && runde + 1 < MAX_AUTO_RUNDEN;
  const params = new URLSearchParams({
    ligaStatus: ergebnis.status,
    ligaNeu: String(ergebnis.neu),
    ligaAnfragen: String(ergebnis.anfragen),
  });
  if (meldungen.length) params.set("ligaMeldungen", meldungen.slice(0, 8).join(" | "));
  // Unvollständig (Zeitlimit): die Seite macht nach kurzer Pause selbst weiter.
  if (weiter) {
    params.set("ligaWeiter", "1");
    params.set("ligaRunde", String(runde + 1));
  }
  revalidatePath("/admin/einstellungen");
  redirect(`/admin/einstellungen?${params.toString()}`);
}

const ZUSATZ_KATEGORIEN = ["herren", "damen", "jugend_maennlich", "jugend_weiblich", "kinder"] as const;
const MAX_ZUSATZQUELLEN = 5;

// Nach dem Ändern der Zusatzquellen sofort synchronisieren (Struktur + Spiele),
// damit das Ergebnis direkt sichtbar ist bzw. entfernte Mannschaften
// verschwinden; bei Zeitlimit setzt der Auto-Weiter-Mechanismus fort.
async function syncNachZusatzquelle(ligaVereinId: string): Promise<never> {
  const ergebnis = await synchronisiereAlleQuellen(ligaVereinId, {
    db: adminDb,
    holeHtml: holeNuligaHtml,
    holeJson: holeHandballNetApi,
    frist: Date.now() + 45_000,
  });
  const params = new URLSearchParams({
    ligaStatus: ergebnis.status,
    ligaNeu: String(ergebnis.neu),
    ligaAnfragen: String(ergebnis.anfragen),
  });
  if (ergebnis.meldungen.length) params.set("ligaMeldungen", ergebnis.meldungen.slice(0, 8).join(" | "));
  if (ergebnis.unvollstaendig) {
    params.set("ligaWeiter", "1");
    params.set("ligaRunde", "1");
  }
  revalidatePath("/admin/einstellungen");
  redirect(`/admin/einstellungen?${params.toString()}`);
}

// Weiteren nuLiga-Verein (z.B. Partnerverein einer Spielgemeinschaft)
// anbinden — übernommen werden NUR Mannschaften, die zum Filter passen.
export async function zusatzquelleHinzufuegen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, session.user.vereinId!),
  });
  if (!ligaVerein) throw new Error("Bitte zuerst die öffentliche Vereinsseite einrichten.");

  const feld = (n: string) => {
    const roh = formData.get(n);
    return typeof roh === "string" ? roh.trim() : "";
  };
  const quelle = feld("zusatzQuelle") === "handball_net" ? "handball_net" : "nuliga";
  const clubId = feld("zusatzClubId");
  if (quelle === "nuliga") {
    if (!/^\d{1,10}$/.test(clubId)) throw new Error("Die nuLiga-Vereins-ID besteht nur aus Ziffern.");
    if (clubId === ligaVerein.nuligaClubId) {
      throw new Error("Das ist die ID eures eigenen Vereins — die ist oben bereits hinterlegt.");
    }
  } else {
    if (!/^[a-z0-9]{3,20}$/i.test(clubId)) {
      throw new Error("Die handball.net-Vereins-ID besteht aus Buchstaben/Ziffern (z.B. 0b8y490).");
    }
    if (clubId === ligaVerein.handballNetClubId) {
      throw new Error("Das ist die ID eures eigenen Vereins — die ist oben bereits hinterlegt.");
    }
  }
  const kategorien = ZUSATZ_KATEGORIEN.filter((k) => formData.getAll("zusatzKategorie").includes(k));
  const nameEnthaelt = feld("zusatzNameEnthaelt").slice(0, 60) || null;
  if (kategorien.length === 0 && !nameEnthaelt) {
    throw new Error("Bitte mindestens eine Kategorie oder einen Namensteil als Filter angeben — sonst würde der ganze Verein übernommen.");
  }
  const bestehende = await adminDb.query.ligaVereinZusatzquellen.findMany({
    where: eq(ligaVereinZusatzquellen.ligaVereinId, ligaVerein.id),
    columns: { nuligaClubId: true, handballNetClubId: true },
  });
  const schonDa = bestehende.some((b) => (quelle === "nuliga" ? b.nuligaClubId : b.handballNetClubId) === clubId);
  if (bestehende.length >= MAX_ZUSATZQUELLEN && !schonDa) {
    throw new Error(`Höchstens ${MAX_ZUSATZQUELLEN} weitere Vereine.`);
  }

  const werte = {
    bezeichnung: feld("zusatzBezeichnung").slice(0, 80) || null,
    kategorien: kategorien.join(","),
    nameEnthaelt,
  };
  await adminDb
    .insert(ligaVereinZusatzquellen)
    .values({
      ligaVereinId: ligaVerein.id,
      ...(quelle === "nuliga" ? { nuligaClubId: clubId } : { handballNetClubId: clubId }),
      ...werte,
    })
    .onConflictDoUpdate({
      target:
        quelle === "nuliga"
          ? [ligaVereinZusatzquellen.ligaVereinId, ligaVereinZusatzquellen.nuligaClubId]
          : [ligaVereinZusatzquellen.ligaVereinId, ligaVereinZusatzquellen.handballNetClubId],
      set: werte,
    });
  await syncNachZusatzquelle(ligaVerein.id);
}

export async function zusatzquelleEntfernen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Ungültige Anfrage.");
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, session.user.vereinId!),
  });
  if (!ligaVerein) throw new Error("Öffentliche Vereinsseite nicht gefunden.");
  await adminDb
    .delete(ligaVereinZusatzquellen)
    .where(and(eq(ligaVereinZusatzquellen.id, id), eq(ligaVereinZusatzquellen.ligaVereinId, ligaVerein.id)));
  await syncNachZusatzquelle(ligaVerein.id);
}

export async function oeffentlicheSeiteEntfernen() {
  const session = await requireAdminSchreibzugriff();
  // Löscht die gesamte öffentliche Seite (Mannschaften, Teilnahmen,
  // Favoriten per Cascade); Gruppen/Spiele bleiben als öffentliche
  // Sportdaten bestehen, solange andere Vereine sie nutzen.
  await adminDb.delete(ligaVereine).where(eq(ligaVereine.vereinId, session.user.vereinId!));
  revalidatePath("/admin/einstellungen");
  redirect("/admin/einstellungen");
}

// Logo für die öffentliche Seite/Web-App hochladen (PNG/JPEG/WebP, max. 5 MB).
// Wird geprüft und zu einem 512x512-PNG normalisiert (siehe lib/liga-logo.ts).
export async function logoHochladen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, session.user.vereinId!),
    columns: { id: true },
  });
  if (!ligaVerein) throw new Error("Bitte zuerst die öffentliche Vereinsseite anlegen.");

  const datei = formData.get("logo");
  if (!(datei instanceof File) || datei.size === 0) throw new Error("Bitte eine Bilddatei auswählen.");

  let png: Buffer;
  try {
    png = await verarbeiteLogo(Buffer.from(await datei.arrayBuffer()));
  } catch (err) {
    if (err instanceof LogoFehler) throw new Error(err.message);
    throw err;
  }

  // Vereinsfarbe aus dem Logo ableiten (null = farbloses Logo -> Standardfarbe).
  const farbton = await ermittleFarbton(png);

  await adminDb
    .insert(ligaVereinLogos)
    .values({ ligaVereinId: ligaVerein.id, png, farbton, aktualisiertAm: new Date() })
    .onConflictDoUpdate({
      target: ligaVereinLogos.ligaVereinId,
      set: { png, farbton, aktualisiertAm: new Date() },
    });
  revalidatePath("/admin/einstellungen");
  redirect("/admin/einstellungen");
}

export async function logoEntfernen() {
  const session = await requireAdminSchreibzugriff();
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, session.user.vereinId!),
    columns: { id: true },
  });
  if (ligaVerein) {
    await adminDb.delete(ligaVereinLogos).where(eq(ligaVereinLogos.ligaVereinId, ligaVerein.id));
  }
  revalidatePath("/admin/einstellungen");
  redirect("/admin/einstellungen");
}

// Anzeigenamen der Mannschaften auf der öffentlichen Seite anpassen. Leer =
// Name aus der Quelle (nuLiga/handball.net). Der Slug (die Adresse der
// Mannschaftsseite) bleibt unverändert, damit Links und Favoriten nicht brechen.
export async function mannschaftsnamenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, session.user.vereinId!),
    columns: { id: true },
  });
  if (!ligaVerein) throw new Error("Keine öffentliche Vereinsseite vorhanden.");

  for (const [schluessel, wert] of formData.entries()) {
    if (!schluessel.startsWith("name_") || typeof wert !== "string") continue;
    const id = schluessel.slice("name_".length);
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const name = wert.replace(/\s+/g, " ").trim().slice(0, 60);
    // Nur Mannschaften dieses Vereins (liga_* hat keine RLS).
    await adminDb
      .update(ligaMannschaften)
      .set({ anzeigenameEigen: name === "" ? null : name })
      .where(and(eq(ligaMannschaften.id, id), eq(ligaMannschaften.ligaVereinId, ligaVerein.id)));
  }
  revalidatePath("/admin/einstellungen");
  revalidatePath("/verein", "layout");
  redirect("/admin/einstellungen");
}

// Support-Zugriff: nur der Vereinsadmin selbst gibt ihn frei (befristet) oder
// widerruft ihn. Ein Systemadmin im Treuhand-Kontext darf das nie für sich tun.
export async function supportZugriffSetzen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  if (session.user.treuhand) {
    throw new Error("Die Support-Freigabe kann nur der Vereinsadmin selbst erteilen.");
  }
  const roh = formData.get("tage");
  const tage = roh === "widerrufen" ? null : Number(roh);
  const akteur = session.user.name ?? session.user.email ?? "Vereinsadmin";
  const bis = await setzeSupportFreigabe(session.user.vereinId!, tage, akteur);
  // Systemadmins erfahren per Mail von einer neuen Freigabe (best effort).
  if (bis) {
    try {
      await benachrichtigeSystemAdminsUeberSupportFreigabe(session.user.vereinId!, bis, akteur);
    } catch (err) {
      console.error("Support-Freigabe-Benachrichtigung fehlgeschlagen:", err);
    }
  }
  revalidatePath("/admin/einstellungen");
  redirect("/admin/einstellungen");
}
