import "server-only";
import { and, count, eq, gte, isNotNull, lte } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import {
  funktionstraegerRollen,
  ligaVereine,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import {
  ONLINE_FENSTER_MS,
  lebenszeichen,
  einrichtungsPunkte,
  type VereinsKennzahlen,
} from "./verein-gesundheit-bewertung";

export type VereinsGesundheit = {
  id: string;
  name: string;
  status: "vorbereitung" | "aktiv";
  erstelltAm: Date;
  kennzahlen: VereinsKennzahlen;
  lebenszeichen: ReturnType<typeof lebenszeichen>;
  punkte: ReturnType<typeof einrichtungsPunkte>;
};

export type OnlinePerson = { name: string | null; email: string; vereinName: string; istAdmin: boolean; zuletzt: Date };

const TAG_MS = 24 * 60 * 60 * 1000;

// Vereinsübergreifende Sicht des Systemadmins (adminDb, RLS-frei — genau seine Aufgabe). Nur Kennzahlen und
// Zeitstempel, keine Inhalte der Vereine.
export async function holeVereinsGesundheit(jetzt = new Date()): Promise<{
  vereine: VereinsGesundheit[];
  online: OnlinePerson[];
}> {
  const [alleVereine, personen, rollen, mannschaftsZahlen, terminZahlen, einteilungsZahlen, seiten] = await Promise.all([
    adminDb
      .select({
        id: vereine.id,
        name: vereine.name,
        status: vereine.status,
        erstelltAm: vereine.erstelltAm,
        avvAkzeptiertAm: vereine.avvAkzeptiertAm,
      })
      .from(vereine),
    adminDb
      .select({
        id: users.id,
        vereinId: users.vereinId,
        name: users.name,
        email: users.email,
        istAdmin: users.istAdmin,
        letzterLoginAm: users.letzterLoginAm,
        letzteAktivitaetAm: users.letzteAktivitaetAm,
      })
      .from(users)
      .where(isNotNull(users.vereinId)),
    adminDb
      .selectDistinct({ userId: funktionstraegerRollen.userId })
      .from(funktionstraegerRollen)
      .where(eq(funktionstraegerRollen.aktiv, true)),
    adminDb.select({ vereinId: mannschaften.vereinId, anzahl: count() }).from(mannschaften).groupBy(mannschaften.vereinId),
    adminDb
      .select({ vereinId: termine.vereinId, anzahl: count() })
      .from(termine)
      .where(gte(termine.start, jetzt))
      .groupBy(termine.vereinId),
    adminDb
      .select({ vereinId: termine.vereinId, anzahl: count() })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
      .where(
        and(gte(termine.start, new Date(jetzt.getTime() - 30 * TAG_MS)), lte(termine.start, new Date(jetzt.getTime() + 30 * TAG_MS)))
      )
      .groupBy(termine.vereinId),
    adminDb.select({ vereinId: ligaVereine.vereinId }).from(ligaVereine),
  ]);

  const rolleUserIds = new Set(rollen.map((r) => r.userId));
  const zahl = (liste: { vereinId: string; anzahl: number }[]) => new Map(liste.map((z) => [z.vereinId, Number(z.anzahl)]));
  const mannschaftenJeVerein = zahl(mannschaftsZahlen);
  const termineJeVerein = zahl(terminZahlen);
  const einteilungenJeVerein = zahl(einteilungsZahlen);
  const mitSeite = new Set(seiten.map((s) => s.vereinId));

  const zuletztAktiv = (p: { letzterLoginAm: Date | null; letzteAktivitaetAm: Date | null }) => {
    const werte = [p.letzterLoginAm, p.letzteAktivitaetAm].filter((d): d is Date => !!d);
    return werte.length ? new Date(Math.max(...werte.map((d) => d.getTime()))) : null;
  };

  const online: OnlinePerson[] = [];
  const ergebnis: VereinsGesundheit[] = alleVereine.map((v) => {
    const leute = personen.filter((p) => p.vereinId === v.id);
    const aktivitaeten = leute.map(zuletztAktiv);
    const letzte = aktivitaeten.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);
    let onlineJetzt = 0;
    leute.forEach((p, i) => {
      const t = aktivitaeten[i];
      if (t && jetzt.getTime() - t.getTime() <= ONLINE_FENSTER_MS) {
        onlineJetzt++;
        online.push({ name: p.name, email: p.email, vereinName: v.name, istAdmin: p.istAdmin, zuletzt: t });
      }
    });
    const kennzahlen: VereinsKennzahlen = {
      personen: leute.length,
      admins: leute.filter((p) => p.istAdmin).length,
      mitRolle: leute.filter((p) => rolleUserIds.has(p.id)).length,
      angemeldet: leute.filter((p) => p.letzterLoginAm).length,
      adminAngemeldet: leute.some((p) => p.istAdmin && p.letzterLoginAm),
      avvAkzeptiert: !!v.avvAkzeptiertAm,
      mannschaften: mannschaftenJeVerein.get(v.id) ?? 0,
      kuenftigeTermine: termineJeVerein.get(v.id) ?? 0,
      zuordnungen30Tage: einteilungenJeVerein.get(v.id) ?? 0,
      oeffentlicheSeite: mitSeite.has(v.id),
      letzteAktivitaet: letzte,
      onlineJetzt,
    };
    return {
      id: v.id,
      name: v.name,
      status: v.status,
      erstelltAm: v.erstelltAm,
      kennzahlen,
      lebenszeichen: lebenszeichen(letzte, jetzt),
      punkte: einrichtungsPunkte(kennzahlen),
    };
  });

  online.sort((a, b) => b.zuletzt.getTime() - a.zuletzt.getTime());
  return { vereine: ergebnis, online };
}

