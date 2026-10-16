import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users, vereinstermine, vereinsterminAntworten, vereinsterminSichtbar, vereine } from "@/db/schema";
import { darfVereinsterminSehen, type Person } from "./vereinstermine";

export type VereinsterminListe = typeof vereinstermine.$inferSelect & { rollen: string[]; personen: string[] };
export type Teilnehmer = { id: string; name: string | null; email: string };

export async function vereinstermineAktiv(vereinId: string): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const v = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { vereinstermineAktiv: true } });
    return !!v?.vereinstermineAktiv;
  });
}

// Die Rollen einer Person (aktive funktionstraeger_rolle) für die Sichtbarkeitsprüfung.
export async function holeVereinsterminPerson(vereinId: string, userId: string, istAdmin: boolean): Promise<Person> {
  const rollen = await withTenant(vereinId, (tx) =>
    tx
      .select({ typ: funktionstraegerRollen.typ })
      .from(funktionstraegerRollen)
      .where(and(eq(funktionstraegerRollen.userId, userId), eq(funktionstraegerRollen.aktiv, true)))
  );
  return { userId, istAdmin, rollenTypen: rollen.map((r) => r.typ) };
}

// Termine ab dem Beginn des heutigen Tages (laufende/heutige bleiben sichtbar) bzw. alle für die Admin-Liste, jeweils mit ihrer Auswahl.
export async function ladeVereinstermine(vereinId: string, opt: { ab?: Date } = {}): Promise<VereinsterminListe[]> {
  return withTenant(vereinId, async (tx) => {
    const termine = await tx
      .select()
      .from(vereinstermine)
      .where(and(eq(vereinstermine.vereinId, vereinId), ...(opt.ab ? [gte(vereinstermine.start, opt.ab)] : [])))
      .orderBy(asc(vereinstermine.start));
    if (termine.length === 0) return [];
    const auswahl = await tx
      .select()
      .from(vereinsterminSichtbar)
      .where(inArray(vereinsterminSichtbar.vereinsterminId, termine.map((t) => t.id)));
    return termine.map((t) => ({
      ...t,
      rollen: auswahl.filter((a) => a.vereinsterminId === t.id && a.rolle).map((a) => a.rolle!),
      personen: auswahl.filter((a) => a.vereinsterminId === t.id && a.userId).map((a) => a.userId!),
    }));
  });
}

export async function holeSichtbareVereinstermine(vereinId: string, person: Person, ab: Date): Promise<VereinsterminListe[]> {
  const alle = await ladeVereinstermine(vereinId, { ab });
  return alle.filter((t) => darfVereinsterminSehen(t, person));
}

export type Antworten = { userId: string; antwort: string; kommentar: string | null };

export async function ladeAntworten(vereinId: string, terminIds: string[]): Promise<Map<string, Antworten[]>> {
  const karte = new Map<string, Antworten[]>();
  if (terminIds.length === 0) return karte;
  const zeilen = await withTenant(vereinId, (tx) =>
    tx.select().from(vereinsterminAntworten).where(inArray(vereinsterminAntworten.vereinsterminId, terminIds))
  );
  for (const z of zeilen) {
    const liste = karte.get(z.vereinsterminId) ?? [];
    liste.push({ userId: z.userId, antwort: z.antwort, kommentar: z.kommentar });
    karte.set(z.vereinsterminId, liste);
  }
  return karte;
}

export type PersonMitRollen = Teilnehmer & { istAdmin: boolean; rollenTypen: string[] };

// Alle Personen des Vereins mit ihren aktiven Rollen (für Zielgruppe, Einladung und die Personenauswahl). "user" hat keine RLS: der Vereinsfilter ist Pflicht.
export async function ladeVereinsPersonen(vereinId: string): Promise<PersonMitRollen[]> {
  return withTenant(vereinId, async (tx) => {
    const [personen, rollen] = await Promise.all([
      tx
        .select({ id: users.id, name: users.name, email: users.email, istAdmin: users.istAdmin, istAdminLesend: users.istAdminLesend })
        .from(users)
        .where(eq(users.vereinId, vereinId))
        .orderBy(asc(users.name)),
      tx
        .select({ userId: funktionstraegerRollen.userId, typ: funktionstraegerRollen.typ })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(and(eq(users.vereinId, vereinId), eq(funktionstraegerRollen.aktiv, true))),
    ]);
    return personen.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      istAdmin: p.istAdmin || p.istAdminLesend,
      rollenTypen: rollen.filter((r) => r.userId === p.id).map((r) => r.typ),
    }));
  });
}

// Wer den Termin sieht (= wer eingeladen ist und antworten kann).
export function zielgruppe(termin: { sichtbarkeit: string; rollen: string[]; personen: string[] }, personen: PersonMitRollen[]): PersonMitRollen[] {
  return personen.filter((p) => darfVereinsterminSehen(termin, { userId: p.id, istAdmin: p.istAdmin, rollenTypen: p.rollenTypen }));
}
