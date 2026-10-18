import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mitglieder, mitgliedsarten, users, vereine } from "@/db/schema";
import type { ImportPlan } from "@/lib/mitglieder-import";
import { ergaenzeName, planeUeberfuehrung, type KontoPerson, type UeberfuehrungPlan } from "@/lib/mitglieder-ueberfuehrung";

// Add-on Vereinsverwaltung eingeschaltet? Nur der Systemadmin schaltet es frei (/system/abrechnung). Aus = Seiten zeigen einen Hinweis, Actions lehnen ab.
export async function vereinsverwaltungAktiv(vereinId: string): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const v = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { vereinsverwaltungAktiv: true } });
    return !!v?.vereinsverwaltungAktiv;
  });
}

export type MitgliedZeile = typeof mitglieder.$inferSelect;

export async function ladeMitglieder(vereinId: string): Promise<MitgliedZeile[]> {
  return withTenant(vereinId, (tx) => tx.select().from(mitglieder).where(eq(mitglieder.vereinId, vereinId)));
}

// ---------------------------------------------------------------------------
// Überführung der Funktionsträger (Personen mit mindestens einer Rolle) in die Mitgliederliste.
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function berechnePlan(tx: Tx, vereinId: string): Promise<UeberfuehrungPlan> {
  // "user" hat keine RLS: immer mit Vereinsfilter. Eine Person zählt als Funktionsträger, sobald sie irgendeine Rolle hat;
  // aktiv ist sie, wenn mindestens eine Rolle aktiv ist.
  const zeilen = await tx
    .select({ id: users.id, name: users.name, email: users.email, telefon: users.telefonnummer, aktiv: funktionstraegerRollen.aktiv })
    .from(users)
    .innerJoin(funktionstraegerRollen, eq(funktionstraegerRollen.userId, users.id))
    .where(eq(users.vereinId, vereinId));
  const personen = new Map<string, KontoPerson>();
  for (const z of zeilen) {
    const vorhanden = personen.get(z.id);
    if (vorhanden) vorhanden.aktiv = vorhanden.aktiv || z.aktiv;
    else personen.set(z.id, { userId: z.id, name: z.name, email: z.email, telefon: z.telefon, aktiv: z.aktiv });
  }
  const bestehende = await tx
    .select({ id: mitglieder.id, name: mitglieder.name, vorname: mitglieder.vorname, email: mitglieder.email, userId: mitglieder.userId, geburtsdatum: mitglieder.geburtsdatum })
    .from(mitglieder)
    .where(eq(mitglieder.vereinId, vereinId));
  const sortiert = [...personen.values()].sort((a, b) => a.email.localeCompare(b.email));
  return planeUeberfuehrung(sortiert, bestehende);
}

/** Nur lesen: was würde die Überführung tun? (für die Hinweiskarte auf der Mitgliederseite) */
export async function ladeUeberfuehrungsPlan(vereinId: string): Promise<UeberfuehrungPlan> {
  return withTenant(vereinId, (tx) => berechnePlan(tx, vereinId));
}

export type UeberfuehrungErgebnis = { angelegt: number; verknuepft: number; pruefen: number; unvollstaendig: number };

/**
 * Legt fehlende Mitglieder an und verknüpft Treffer mit dem Konto. Nie doppelt (Plan prüft E-Mail und Namen, ein Unique-Index je Verein+Konto sichert ab),
 * ändert nie vorhandene Mitgliedsdaten, löscht nichts. Zweifelsfälle (gleicher Name, andere Adresse) bleiben unberührt und werden gemeldet.
 */
export async function fuehreUeberfuehrungAus(vereinId: string): Promise<UeberfuehrungErgebnis> {
  return withTenant(vereinId, async (tx) => {
    const plan = await berechnePlan(tx, vereinId);
    let angelegt = 0;
    for (const n of plan.neu) {
      const zeilen = await tx
        .insert(mitglieder)
        .values({
          vereinId,
          userId: n.person.userId,
          name: n.name,
          vorname: n.vorname,
          email: n.person.email,
          telefon: n.person.telefon,
          // Immer aktiv: ein Funktionsträger ohne aktivierte Rolle (z.B. nie für den Login freigeschaltet) ist deshalb kein passives Mitglied.
          status: "aktiv",
          eintrittsdatum: null,
          bemerkung: "Aus den Funktionsträgern übernommen.",
        })
        .onConflictDoNothing()
        .returning({ id: mitglieder.id });
      angelegt += zeilen.length;
    }
    for (const v of plan.verknuepfen) {
      await tx
        .update(mitglieder)
        .set({ userId: v.userId })
        .where(and(eq(mitglieder.id, v.mitgliedId), eq(mitglieder.vereinId, vereinId), isNull(mitglieder.userId)));
    }
    return { angelegt, verknuepft: plan.verknuepfen.length, pruefen: plan.pruefen.length, unvollstaendig: plan.unvollstaendig.length };
  });
}

export function ueberfuehrungText(e: UeberfuehrungErgebnis): string {
  const teile = [`${e.angelegt} Mitglieder angelegt`, `${e.verknuepft} mit vorhandenen verknüpft`];
  if (e.pruefen > 0) teile.push(`${e.pruefen} mögliche Doppelte zur Prüfung`);
  if (e.unvollstaendig > 0) teile.push(`${e.unvollstaendig} ohne vollständigen Namen übersprungen`);
  return teile.join(", ");
}

/** Nach Änderungen an den Funktionsträgern: nur wenn das Add-on an ist, nie ein Fehler nach außen (die eigentliche Aktion ist schon gespeichert). */
export async function gleicheFunktionstraegerAb(vereinId: string): Promise<void> {
  try {
    if (await vereinsverwaltungAktiv(vereinId)) await fuehreUeberfuehrungAus(vereinId);
  } catch (err) {
    console.error("Abgleich Funktionsträger -> Mitglieder fehlgeschlagen:", err);
  }
}

// ---------------------------------------------------------------------------
// Arten der Mitgliedschaft
// ---------------------------------------------------------------------------

export type MitgliedsartZeile = { id: string; name: string };

export async function ladeMitgliedsarten(vereinId: string): Promise<MitgliedsartZeile[]> {
  const zeilen = await withTenant(vereinId, (tx) =>
    tx.select({ id: mitgliedsarten.id, name: mitgliedsarten.name }).from(mitgliedsarten).where(eq(mitgliedsarten.vereinId, vereinId))
  );
  return zeilen.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Eine Art-ID aus dem Formular: leer = keine Angabe, sonst muss die Art zu DIESEM Verein gehören (die Fremdschlüssel-Prüfung kennt keine Mandanten). */
export async function pruefeArtId(vereinId: string, roh: string): Promise<{ artId: string | null } | { fehler: string }> {
  const id = roh.trim();
  if (!id) return { artId: null };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { fehler: "Unbekannte Art der Mitgliedschaft." };
  const art = await withTenant(vereinId, (tx) =>
    tx.query.mitgliedsarten.findFirst({ where: and(eq(mitgliedsarten.id, id), eq(mitgliedsarten.vereinId, vereinId)), columns: { id: true } })
  );
  return art ? { artId: art.id } : { fehler: "Unbekannte Art der Mitgliedschaft." };
}

/** Schreibt die neuen Mitglieder eines Import-Plans in EINER Transaktion; fehlende Arten werden vorher angelegt (der Index verhindert Doppelte ohne Beachtung der Schreibweise). */
export async function schreibeImportPlan(vereinId: string, plan: ImportPlan): Promise<void> {
  if (plan.neu.length === 0) return;
  await withTenant(vereinId, async (tx) => {
    if (plan.neueArten.length > 0) await tx.insert(mitgliedsarten).values(plan.neueArten.map((name) => ({ vereinId, name }))).onConflictDoNothing();
    const alleArten = await tx.select({ id: mitgliedsarten.id, name: mitgliedsarten.name }).from(mitgliedsarten).where(eq(mitgliedsarten.vereinId, vereinId));
    const artId = new Map(alleArten.map((a) => [a.name.toLowerCase(), a.id]));
    await tx.insert(mitglieder).values(
      plan.neu.map((n) => {
        // Leeres Eintrittsdatum: der Spaltenstandard (heute) greift nur, wenn der Wert fehlt.
        const { eintrittsdatum, ...rest } = n.wert;
        return { vereinId, ...rest, artId: n.artName ? (artId.get(n.artName.toLowerCase()) ?? null) : null, ...(eintrittsdatum ? { eintrittsdatum } : {}) };
      })
    );
  });
}

/**
 * Ergänzt den Namen eines Funktionsträgers (Konto) um den fehlenden Nachnamen/Vornamen und übernimmt ihn danach in die Mitgliederliste.
 * Nur Personen DIESES Vereins mit mindestens einer Rolle ("user" hat keine RLS: der Vereinsfilter steht ausdrücklich in der Abfrage).
 */
export async function ergaenzeFunktionstraegerName(vereinId: string, userId: string, vorname: string, nachname: string): Promise<{ ok: true } | { fehler: string }> {
  const gefunden = await withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(funktionstraegerRollen, eq(funktionstraegerRollen.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.vereinId, vereinId)))
      .limit(1);
    if (zeilen.length === 0) return { fehler: "Person nicht gefunden." } as const;
    const ergebnis = ergaenzeName(zeilen[0].name, vorname, nachname);
    if ("fehler" in ergebnis) return ergebnis;
    await tx.update(users).set({ name: ergebnis.name }).where(and(eq(users.id, userId), eq(users.vereinId, vereinId)));
    return { ok: true } as const;
  });
  if ("fehler" in gefunden) return gefunden;
  await fuehreUeberfuehrungAus(vereinId);
  return { ok: true };
}
