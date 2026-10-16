import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import {
  dienstArten,
  dienstArtMannschaften,
  fahrtMitfahrer,
  funktionstraegerRollen,
  hallen,
  mannschaften,
  termine,
  terminZuordnungen,
  trainingAusfaelle,
  trainingBelegungen,
  vereinstermine,
  vereinsterminAntworten,
  vereinsterminSichtbar,
  trainingszeiten,
  users,
  vereine,
} from "@/db/schema";
import { AVV_VERSION } from "@/lib/avv";
import { addiereTage, berlinJetzt, wochentagVonDatum } from "@/lib/training-ausfall";
import { berechneSerie } from "@/lib/wiederholung";
import { baueDemoDaten, DEMO_ADMIN, demoEmail, demoErsatzAdresse } from "@/lib/demo-daten";
import {
  DEMO_ADMIN_ID,
  DEMO_RESET_PAUSE_MS,
  DEMO_TOKEN_DIENSTE,
  DEMO_TOKEN_ORDNER,
  DEMO_TOKEN_ZEITNEHMER,
  DEMO_VEREIN_ID,
} from "@/lib/demo-konstanten";

// Öffentlicher Demo-Verein: Interessierte (z.B. ein Verein, dem wir die App zeigen) probieren die Einteilung der Ehrenamtlichen mit Testdaten aus, OHNE
// Konto und OHNE Mail an uns zu schicken (/demo). Es ist ein echter Mandant (RLS, alle Seiten wie bei jedem Verein), mit festen IDs:
//  - status bleibt "vorbereitung": unsichtbar (Suche, Sitemap, öffentliche Seite), sendMail unterdrückt Mails an seine Personen (istEmpfaengerGesperrt),
//    zählt nicht ins Beta-Limit und wird nie wegen Zahlung gesperrt;
//  - Login ohne Passwort NUR als dieser eine Demo-Admin (Provider "demo" in auth.ts);
//  - jede Nacht (Cron /api/cron/demo-reset) und auf Knopfdruck (mit Pause) wird ALLES gelöscht und neu angelegt (setzeDemoVereinZurueck);
//  - Aktionen, die nach außen wirken (Verbandsseiten abrufen, E-Mail-Adresse ändern, Feedback, Verein löschen ...), sind gesperrt (verbieteImDemo);
//  - eingegebene E-Mail-Adressen von Personen werden durch erfundene unter der Demo-Domain ersetzt (demoSichereEmail).

export { DEMO_ADMIN_ID, DEMO_RESET_PAUSE_MS, DEMO_TOKEN_ORDNER, DEMO_TOKEN_ZEITNEHMER, DEMO_VEREIN_ID };

const BERLIN = "Europe/Berlin";

// Wanduhrzeit in Deutschland → UTC-Zeitpunkt (Tage ab "jetzt"), ohne Abhängigkeit von der Zeitzone des Servers (Vercel läuft in UTC).
export function berlinZeit(jetzt: Date, tage: number, stunde: number, minute = 0): Date {
  const teile = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(jetzt);
  const wert = (t: string) => Number(teile.find((p) => p.type === t)!.value);
  const naiv = Date.UTC(wert("year"), wert("month") - 1, wert("day") + tage, stunde, minute);
  // Versatz der Zone an diesem Zeitpunkt bestimmen und abziehen (zweimal, damit auch die Sommerzeit-Grenze stimmt).
  const versatz = (utcMs: number) => {
    const t = new Intl.DateTimeFormat("en-GB", { timeZone: BERLIN, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs));
    const w = (n: string) => Number(t.find((p) => p.type === n)!.value);
    return Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute")) - utcMs;
  };
  let utc = naiv - versatz(naiv);
  utc = naiv - versatz(utc);
  return new Date(utc);
}

export async function istDemoVerein(vereinId: string): Promise<boolean> {
  const [v] = await adminDb.select({ istDemo: vereine.istDemo }).from(vereine).where(eq(vereine.id, vereinId));
  return !!v?.istDemo;
}

// Für Aktionen, die im Demo-Verein nicht laufen dürfen (siehe Kopfkommentar): wirft mit einer verständlichen Meldung.
export async function verbieteImDemo(vereinId: string | null | undefined): Promise<void> {
  if (vereinId && (await istDemoVerein(vereinId))) {
    throw new Error("Das ist in der Demo nicht verfügbar.");
  }
}

// Eingegebene E-Mail-Adresse einer Person: im Demo-Verein durch eine erfundene Adresse ersetzt (siehe demoErsatzAdresse), sonst nur normalisiert.
export async function demoSichereEmail(vereinId: string, email: string): Promise<string> {
  return (await istDemoVerein(vereinId)) ? demoErsatzAdresse(email) : email.trim().toLowerCase();
}

export async function holeDemoVerein() {
  const [v] = await adminDb.select().from(vereine).where(eq(vereine.id, DEMO_VEREIN_ID));
  return v ?? null;
}

// Löscht den Demo-Verein samt ALLEN Daten (FK-Kaskade) und legt ihn mit frischen Testdaten neu an — in EINER Transaktion, damit nie ein halber Verein
// zu sehen ist. Termine sind relativ zu "jetzt", die Demo zeigt also nach jedem Zurücksetzen wieder künftige Spiele.
export async function setzeDemoVereinZurueck(jetzt: Date = new Date()): Promise<{ personen: number; termine: number; zuordnungen: number }> {
  const daten = baueDemoDaten();

  return adminDb.transaction(async (tx) => {
    await tx.delete(vereine).where(eq(vereine.id, DEMO_VEREIN_ID));

    await tx.insert(vereine).values({
      id: DEMO_VEREIN_ID,
      name: daten.vereinName,
      strasse: "Sporthallenweg 3",
      plz: "65183",
      ort: "Musterstadt",
      status: "vorbereitung",
      istDemo: true,
      // Der Extra-Punkt "Training" ist im Demo für alle sichtbar, damit Besucher ihn sehen.
      trainingFuerAlleSichtbar: true,
      vereinstermineAktiv: true,
      tarif: "befreit",
      avvAkzeptiertAm: jetzt,
      avvAkzeptiertVersion: AVV_VERSION,
      avvAkzeptiertVonName: DEMO_ADMIN.name,
      avvAkzeptiertVonEmail: demoEmail(DEMO_ADMIN.key),
      // Dienste-Bedarf je Veranstaltung (Einstellungen → Dienste)
      testspielOrdnerBedarf: 1,
      testspielKioskdienstBedarf: 1,
      testspielKassiererBedarf: 0,
      testspielZeitnehmerBedarf: 1,
      turnierOrdnerBedarf: 4,
      turnierKioskdienstBedarf: 3,
      turnierKassiererBedarf: 2,
      turnierZeitnehmerBedarf: 1,
      rundenspielOrdnerBedarf: 2,
      rundenspielKioskdienstBedarf: 2,
      rundenspielKassiererBedarf: 1,
      rundenspielZeitnehmerBedarf: 1,
      // Beide öffentlichen Eintragungs-Links (Eltern/Helfer ohne Login) sind aktiv: /eintragen/<Token>
      zeitnehmerSelbstanmeldungToken: DEMO_TOKEN_ZEITNEHMER,
      ordnerSelbstanmeldungToken: DEMO_TOKEN_ORDNER,
      diensteSelbstanmeldungToken: DEMO_TOKEN_DIENSTE,
      trainingsplanStartMinuten: 15 * 60,
      trainingsplanEndMinuten: 21 * 60,
    });

    // Personen. Der Demo-Admin hat eine feste ID (der Login ohne Passwort sucht genau diese) und kein Passwort.
    const userIdNach = new Map<string, string>();
    for (const p of daten.personen) {
      const istAdmin = p.key === DEMO_ADMIN.key;
      const [u] = await tx
        .insert(users)
        .values({
          ...(istAdmin ? { id: DEMO_ADMIN_ID } : {}),
          email: demoEmail(p.key),
          name: p.name,
          vereinId: DEMO_VEREIN_ID,
          istAdmin,
          letzterLoginAm: jetzt,
        })
        .returning({ id: users.id });
      userIdNach.set(p.key, u.id);
    }

    const mannschaftIdNach = new Map<string, string>();
    for (const m of daten.mannschaften) {
      const [row] = await tx.insert(mannschaften).values({ vereinId: DEMO_VEREIN_ID, ...m }).returning({ id: mannschaften.id });
      mannschaftIdNach.set(m.name, row.id);
    }
    const mannschaftId = (name: string) => {
      const id = mannschaftIdNach.get(name);
      if (!id) throw new Error(`Demo: unbekannte Mannschaft ${name}`);
      return id;
    };

    const rollen = daten.personen.flatMap((p) =>
      p.rollen.map((r) => ({
        userId: userIdNach.get(p.key)!,
        typ: r.typ,
        aktiv: r.aktiv ?? true,
        mannschaftId: r.mannschaft ? mannschaftId(r.mannschaft) : null,
        lizenzGueltigBis: r.lizenzTage != null ? berlinZeit(jetzt, r.lizenzTage, 0) : null,
      }))
    );
    await tx.insert(funktionstraegerRollen).values(rollen);

    const [halle] = await tx
      .insert(hallen)
      .values({ vereinId: DEMO_VEREIN_ID, name: "Sporthalle Musterstadt", abteilAnzahl: 2, abteil1Name: "Halle A", abteil2Name: "Halle B" })
      .returning({ id: hallen.id });
    // Zweiter Ort: Beachplatz mit Saison (April bis Oktober) für die Beachhandball-Trainings des Plans.
    const [beachplatz] = await tx
      .insert(hallen)
      .values({ vereinId: DEMO_VEREIN_ID, name: "Beachplatz am Stadion", art: "platz", saisonVonMonat: 4, saisonBisMonat: 10 })
      .returning({ id: hallen.id });
    const trainingszeitZeilen = await tx
      .insert(trainingszeiten)
      .values(
        daten.trainingsplan.map((e) => ({
          vereinId: DEMO_VEREIN_ID,
          mannschaftId: mannschaftId(e.mannschaft),
          halleId: e.platz ? beachplatz.id : halle.id,
          wochentag: e.wochentag,
          startMinuten: e.vonMinuten,
          endMinuten: e.bisMinuten,
          farbe: e.farbe,
          abteilNummer: e.abteil ?? null,
        }))
      )
      .returning({ id: trainingszeiten.id, wochentag: trainingszeiten.wochentag, mannschaftId: trainingszeiten.mannschaftId, startMinuten: trainingszeiten.startMinuten });
    // Ausfälle: das nächste künftige Training (ab morgen) an dem Wochentag der gemeldeten Zeile.
    const heute = berlinJetzt(jetzt).datum;
    for (const a of daten.trainingsausfaelle) {
      const plan = daten.trainingsplan[a.trainingIndex];
      const zeile = trainingszeitZeilen.find((z) => z.mannschaftId === mannschaftId(plan.mannschaft) && z.wochentag === plan.wochentag && z.startMinuten === plan.vonMinuten);
      if (!zeile) continue;
      const datum = [1, 2, 3, 4, 5, 6, 7].map((n) => addiereTage(heute, n)).find((d) => wochentagVonDatum(d) === plan.wochentag)!;
      await tx.insert(trainingAusfaelle).values({ vereinId: DEMO_VEREIN_ID, trainingszeitId: zeile.id, datum, grund: a.grund, gemeldetVon: DEMO_ADMIN_ID });
      if (a.belegtVon) {
        await tx.insert(trainingBelegungen).values({ vereinId: DEMO_VEREIN_ID, trainingszeitId: zeile.id, datum, mannschaftId: mannschaftId(a.belegtVon), notiz: a.belegtNotiz ?? null, gebuchtVon: DEMO_ADMIN_ID });
      }
    }

    // Vereinstermine (Sitzung nur für Trainer, Arbeitseinsatz für alle) mit ein paar Antworten.
    for (const v of daten.vereinstermine) {
      const start = berlinZeit(jetzt, v.tage, v.stunde, 0);
      const starts = v.serie ? berechneSerie(start, v.serie.wiederholung, addiereTage(berlinJetzt(jetzt).datum, v.serie.bisTage)) : [start];
      const serieId = v.serie ? randomUUID() : null;
      const angelegt = await tx
        .insert(vereinstermine)
        .values(
          starts.map((s) => ({
            vereinId: DEMO_VEREIN_ID,
            titel: v.titel,
            art: v.art,
            beschreibung: v.beschreibung,
            ort: v.ort,
            start: s,
            ende: new Date(s.getTime() + v.dauerMinuten * 60_000),
            sichtbarkeit: v.sichtbarkeit,
            antwortAbfrage: true,
            serieId,
            wiederholung: v.serie?.wiederholung ?? null,
            erstelltVon: DEMO_ADMIN_ID,
          }))
        )
        .returning({ id: vereinstermine.id, start: vereinstermine.start });
      angelegt.sort((a, b) => a.start.getTime() - b.start.getTime());
      if (v.rollen?.length) {
        await tx.insert(vereinsterminSichtbar).values(angelegt.flatMap((vt) => v.rollen!.map((rolle) => ({ vereinsterminId: vt.id, vereinId: DEMO_VEREIN_ID, rolle }))));
      }
      // Antworten nur zum ersten Termin der Serie
      if (v.antworten.length) {
        await tx.insert(vereinsterminAntworten).values(
          v.antworten.map((a) => ({
            vereinsterminId: angelegt[0].id,
            userId: userIdNach.get(a.person)!,
            vereinId: DEMO_VEREIN_ID,
            antwort: a.antwort,
            kommentar: a.kommentar ?? null,
          }))
        );
      }
    }

    const terminIdNach = new Map<string, string>();
    for (const t of daten.termine) {
      const [row] = await tx
        .insert(termine)
        .values({
          vereinId: DEMO_VEREIN_ID,
          quelle: "manuell",
          erstelltVon: DEMO_ADMIN_ID,
          typ: t.typ,
          start: berlinZeit(jetzt, t.tage, t.stunde, t.minute ?? 0),
          ende: new Date(berlinZeit(jetzt, t.tage, t.stunde, t.minute ?? 0).getTime() + t.dauerMinuten * 60_000),
          ort: t.ort ?? "Sporthalle Musterstadt",
          beschreibung: t.beschreibung,
          mannschaftId: mannschaftId(t.mannschaft),
          pflichtspiel: t.pflichtspiel ?? null,
          heimMannschaftName: t.heim ?? null,
          auswaertsMannschaftName: t.gast ?? null,
          ergebnisHeim: t.ergebnis?.[0] ?? null,
          ergebnisAuswaerts: t.ergebnis?.[1] ?? null,
        })
        .returning({ id: termine.id });
      terminIdNach.set(t.key, row.id);
    }

    await tx.insert(terminZuordnungen).values(
      daten.zuordnungen.map((z) => ({
        terminId: terminIdNach.get(z.termin)!,
        userId: z.person ? userIdNach.get(z.person)! : null,
        externerName: z.externerName ?? null,
        matchVorschlagUserId: z.vorschlag ? userIdNach.get(z.vorschlag)! : null,
        funktionstraegerTyp: z.typ,
        quelle: z.quelle,
        // Die Anfrage kam "vor ein paar Stunden", damit sie in der Wart-Liste sofort auffällt
        abmeldungAngefragtAm: z.abmeldung ? new Date(jetzt.getTime() - 3 * 60 * 60_000) : null,
      }))
    );

    // Eigene Dienste (Kuchen, Fahrer) mit Mannschaftsauswahl und einigen Einteilungen.
    const dienstIdNach = new Map<string, string>();
    for (const [i, d] of daten.eigeneDienste.entries()) {
      const [row] = await tx
        .insert(dienstArten)
        .values({
          vereinId: DEMO_VEREIN_ID,
          name: d.name,
          beschreibung: d.beschreibung ?? null,
          bedarfHeim: d.bedarf.heim,
          bedarfAuswaerts: d.bedarf.auswaerts,
          bedarfFreundschaft: d.bedarf.freundschaft,
          bedarfTurnier: d.bedarf.turnier,
          fahrgemeinschaft: !!d.fahrgemeinschaft,
          nurAusgewaehlteMannschaften: !!d.mannschaften?.length,
          reihenfolge: i,
        })
        .returning({ id: dienstArten.id });
      dienstIdNach.set(d.key, row.id);
      if (d.mannschaften?.length) {
        await tx
          .insert(dienstArtMannschaften)
          .values(d.mannschaften.map((m) => ({ dienstArtId: row.id, mannschaftId: mannschaftId(m), vereinId: DEMO_VEREIN_ID })));
      }
    }
    if (daten.eigeneEinteilungen.length) {
      const eingefuegt = await tx.insert(terminZuordnungen).values(
        daten.eigeneEinteilungen.map((e) => ({
          terminId: terminIdNach.get(e.termin)!,
          userId: e.person ? userIdNach.get(e.person)! : null,
          externerName: e.externerName ?? null,
          funktionstraegerTyp: "eigener_dienst" as const,
          dienstArtId: dienstIdNach.get(e.dienst)!,
          quelle: e.person ? ("zugeordnet_durch_admin" as const) : ("selbst_eingetragen_oeffentlich" as const),
          abmeldungAngefragtAm: e.abmeldung ? new Date(jetzt.getTime() - 2 * 60 * 60_000) : null,
          plaetze: e.plaetze ?? null,
          fahrtHinweis: e.fahrtHinweis ?? null,
        }))
      ).returning({ id: terminZuordnungen.id });
      // Mitfahrer der Fahrgemeinschaft (Postgres liefert RETURNING eines mehrzeiligen INSERT in der Reihenfolge der VALUES)
      const mitfahrer = daten.eigeneEinteilungen.flatMap((e, i) =>
        (e.mitfahrer ?? []).map((name) => ({ zuordnungId: eingefuegt[i].id, vereinId: DEMO_VEREIN_ID, name }))
      );
      if (mitfahrer.length) await tx.insert(fahrtMitfahrer).values(mitfahrer);
    }

    return { personen: daten.personen.length, termine: daten.termine.length, zuordnungen: daten.zuordnungen.length };
  });
}
