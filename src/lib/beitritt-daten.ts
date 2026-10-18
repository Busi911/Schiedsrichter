import "server-only";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { beitrittAntraege, mitglieder, mitgliedMannschaften, vereine } from "@/db/schema";
import { MAX_ANTRAEGE_PRO_STUNDE, pruefeBeitrittAntrag, type BeitrittEingabe } from "@/lib/beitritt";
import { sendeAbsage, sendeAnnahme, sendeAntragAnAdmins, sendeEingangsbestaetigung } from "@/lib/beitritt-mail";
import { saisonLabel } from "@/lib/saison";
import { heuteBerlin } from "@/lib/mitglieder";
import { findeMitglied } from "@/lib/mitglieder-ueberfuehrung";
import { ladeVereinsMannschaften, type VereinsMannschaft } from "@/lib/mitglied-mannschaften-daten";
import { holeVerein } from "@/lib/liga-oeffentlich";

export type BeitrittsSeite = { vereinId: string; slug: string; vereinName: string; satzungUrl: string | null; mannschaften: VereinsMannschaft[] };

/** Daten der öffentlichen Beitrittsseite, oder null (= 404): Verein sichtbar, Add-on Vereinsverwaltung UND Online-Beitritt eingeschaltet. */
export async function ladeBeitrittsSeite(slug: string): Promise<BeitrittsSeite | null> {
  const liga = await holeVerein(slug);
  if (!liga) return null;
  const [v] = await adminDb
    .select({ name: vereine.name, aktiv: vereine.vereinsverwaltungAktiv, beitritt: vereine.beitrittAktiv, satzungUrl: vereine.satzungUrl })
    .from(vereine)
    .where(eq(vereine.id, liga.vereinId));
  if (!v || !v.aktiv || !v.beitritt) return null;
  return { vereinId: liga.vereinId, slug: liga.slug, vereinName: v.name, satzungUrl: v.satzungUrl, mannschaften: await ladeVereinsMannschaften(liga.vereinId) };
}

export type EinreichErgebnis = { ok: true } | { ok: false; fehler: string };

/**
 * Nimmt einen Antrag vom öffentlichen Formular an (ohne Login, deshalb über adminDb mit ausdrücklichem verein_id). Schutz: Köderfeld (still verworfen),
 * höchstens MAX_ANTRAEGE_PRO_STUNDE je Verein und Stunde, derselbe offene Antrag (gleiche E-Mail) wird nicht doppelt angelegt (keine zweite Mail, die Antwort bleibt gleich).
 */
export async function reicheBeitrittEin(slug: string, eingabe: BeitrittEingabe, koeder: string, jetzt: Date = new Date()): Promise<EinreichErgebnis> {
  const seite = await ladeBeitrittsSeite(slug);
  if (!seite) return { ok: false, fehler: "Der Online-Beitritt ist für diesen Verein nicht verfügbar." };
  if (koeder.trim() !== "") return { ok: true };

  const gepruefte = pruefeBeitrittAntrag(eingabe, { satzungErforderlich: !!seite.satzungUrl });
  if ("fehler" in gepruefte) return { ok: false, fehler: gepruefte.fehler };
  const w = gepruefte.wert;
  if (w.mannschaftId && !seite.mannschaften.some((m) => m.id === w.mannschaftId)) return { ok: false, fehler: "Diese Mannschaft gibt es nicht." };

  const vorStunde = new Date(jetzt.getTime() - 3_600_000);
  const [{ n }] = await adminDb
    .select({ n: sql<number>`count(*)::int` })
    .from(beitrittAntraege)
    .where(and(eq(beitrittAntraege.vereinId, seite.vereinId), gte(beitrittAntraege.erstelltAm, vorStunde)));
  if (n >= MAX_ANTRAEGE_PRO_STUNDE) return { ok: false, fehler: "Gerade sind sehr viele Anträge eingegangen. Bitte versuche es in einer Stunde noch einmal." };

  const [offen] = await adminDb
    .select({ id: beitrittAntraege.id })
    .from(beitrittAntraege)
    .where(and(eq(beitrittAntraege.vereinId, seite.vereinId), eq(beitrittAntraege.status, "offen"), sql`lower(${beitrittAntraege.email}) = ${w.email}`))
    .limit(1);
  if (offen) return { ok: true };

  await adminDb.insert(beitrittAntraege).values({
    vereinId: seite.vereinId,
    vorname: w.vorname,
    name: w.name,
    geburtsdatum: w.geburtsdatum,
    email: w.email,
    telefon: w.telefon,
    geschlecht: w.geschlecht,
    mannschaftId: w.mannschaftId,
    einwilligungen: w.einwilligungen,
    erstelltAm: jetzt,
  });
  const wunsch = w.mannschaftId ? (seite.mannschaften.find((m) => m.id === w.mannschaftId)?.name ?? null) : null;
  await sendeAntragAnAdmins(seite.vereinId, seite.vereinName, { vorname: w.vorname, name: w.name, email: w.email }, wunsch);
  await sendeEingangsbestaetigung(w.email, seite.vereinName, w.vorname);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vereinsadmin: Anträge ansehen, annehmen, ablehnen
// ---------------------------------------------------------------------------

export type AntragZeile = typeof beitrittAntraege.$inferSelect;

export async function ladeAntraege(vereinId: string): Promise<AntragZeile[]> {
  return withTenant(vereinId, (tx) => tx.select().from(beitrittAntraege).where(eq(beitrittAntraege.vereinId, vereinId)).orderBy(desc(beitrittAntraege.erstelltAm)));
}

/** Slug der öffentlichen Vereinsseite (für den Link zum Formular), falls es eine gibt. */
export async function holeOeffentlichenSlug(vereinId: string): Promise<string | null> {
  const r = await adminDb.query.ligaVereine.findFirst({ where: (l, { eq: gleich }) => gleich(l.vereinId, vereinId), columns: { slug: true } });
  return r?.slug ?? null;
}

async function vereinsName(vereinId: string): Promise<string> {
  const [v] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  return v?.name ?? "Verein";
}

export type EntscheidungsErgebnis = { ok: true } | { ok: false; fehler: string };

/**
 * Nimmt einen offenen Antrag an: legt das Mitglied an (aktiv, Eintritt heute, Hinweis auf Online-Beitritt und Einwilligungen in der Bemerkung), ordnet den
 * Mannschaftswunsch der laufenden Saison zu und schickt eine Willkommens-Mail. Gibt es das Mitglied wohl schon (E-Mail oder Name, siehe findeMitglied),
 * wird nichts angelegt, bis der Admin ausdrücklich "trotzdem" bestätigt. Ein Antrag wird nur einmal bearbeitet (atomar).
 */
export async function nehmeAntragAn(vereinId: string, antragId: string, opt: { trotzdem?: boolean } = {}): Promise<EntscheidungsErgebnis> {
  const eigene = await ladeVereinsMannschaften(vereinId);
  const ergebnis = await withTenant(vereinId, async (tx) => {
    const [antrag] = await tx.select().from(beitrittAntraege).where(and(eq(beitrittAntraege.id, antragId), eq(beitrittAntraege.vereinId, vereinId), eq(beitrittAntraege.status, "offen")));
    if (!antrag) return { ok: false, fehler: "Der Antrag ist nicht mehr offen." } as const;

    const vorhandene = await tx
      .select({ id: mitglieder.id, name: mitglieder.name, vorname: mitglieder.vorname, email: mitglieder.email, userId: mitglieder.userId, geburtsdatum: mitglieder.geburtsdatum })
      .from(mitglieder)
      .where(eq(mitglieder.vereinId, vereinId));
    const treffer = findeMitglied({ vorname: antrag.vorname, name: antrag.name, email: antrag.email, geburtsdatum: antrag.geburtsdatum }, vorhandene);
    if (treffer && !opt.trotzdem) {
      return { ok: false, fehler: `Es gibt schon ein Mitglied „${treffer.mitglied.name}, ${treffer.mitglied.vorname}“. Bitte prüfen oder „Trotzdem als neues Mitglied annehmen“ bestätigen.` } as const;
    }

    const [beansprucht] = await tx
      .update(beitrittAntraege)
      .set({ status: "angenommen" })
      .where(and(eq(beitrittAntraege.id, antragId), eq(beitrittAntraege.status, "offen")))
      .returning({ id: beitrittAntraege.id });
    if (!beansprucht) return { ok: false, fehler: "Der Antrag ist nicht mehr offen." } as const;

    const e = antrag.einwilligungen ?? {};
    const ja = (b: boolean | undefined) => (b ? "ja" : "nein");
    const [neu] = await tx
      .insert(mitglieder)
      .values({
        vereinId,
        name: antrag.name,
        vorname: antrag.vorname,
        geburtsdatum: antrag.geburtsdatum,
        email: antrag.email,
        telefon: antrag.telefon,
        geschlecht: antrag.geschlecht,
        status: "aktiv",
        eintrittsdatum: heuteBerlin(),
        bemerkung: `Online-Beitritt vom ${antrag.erstelltAm ? heuteBerlinDatum(antrag.erstelltAm) : "?"}. Einwilligungen: Datenschutz ${ja(e.datenschutz)}, Satzung ${ja(e.vereinigung)}, Fotos/Videos ${ja(e.fotos)}.`,
      })
      .returning({ id: mitglieder.id });
    // Mannschaftswunsch nur, wenn die Mannschaft (noch) zum eigenen Verein gehört.
    if (antrag.mannschaftId && eigene.some((m) => m.id === antrag.mannschaftId)) {
      await tx.insert(mitgliedMannschaften).values({ mitgliedId: neu.id, mannschaftId: antrag.mannschaftId, saison: saisonLabel(new Date()), rolle: "spieler" }).onConflictDoNothing();
    }
    return { ok: true, antrag } as const;
  });
  if (!ergebnis.ok) return ergebnis;
  await sendeAnnahme(ergebnis.antrag.email, await vereinsName(vereinId), ergebnis.antrag.vorname);
  return { ok: true };
}

export async function lehneAntragAb(vereinId: string, antragId: string, grund: string): Promise<EntscheidungsErgebnis> {
  const abgelehnt = await withTenant(vereinId, async (tx) => {
    const [a] = await tx
      .update(beitrittAntraege)
      .set({ status: "abgelehnt" })
      .where(and(eq(beitrittAntraege.id, antragId), eq(beitrittAntraege.vereinId, vereinId), eq(beitrittAntraege.status, "offen")))
      .returning({ email: beitrittAntraege.email, vorname: beitrittAntraege.vorname });
    return a;
  });
  if (!abgelehnt) return { ok: false, fehler: "Der Antrag ist nicht mehr offen." };
  await sendeAbsage(abgelehnt.email, await vereinsName(vereinId), abgelehnt.vorname, grund.trim().slice(0, 500) || null);
  return { ok: true };
}

/** Löscht einen BEARBEITETEN Antrag (angenommen/abgelehnt) endgültig, z.B. auf Wunsch der Person; offene Anträge müssen erst angenommen oder abgelehnt werden. */
export async function loescheBearbeitetenAntrag(vereinId: string, antragId: string): Promise<EntscheidungsErgebnis> {
  const geloescht = await withTenant(vereinId, (tx) =>
    tx
      .delete(beitrittAntraege)
      .where(and(eq(beitrittAntraege.id, antragId), eq(beitrittAntraege.vereinId, vereinId), ne(beitrittAntraege.status, "offen")))
      .returning({ id: beitrittAntraege.id })
  );
  return geloescht.length > 0 ? { ok: true } : { ok: false, fehler: "Nur bearbeitete Anträge lassen sich löschen." };
}

function heuteBerlinDatum(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(d);
}
