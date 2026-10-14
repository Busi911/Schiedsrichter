import "server-only";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { dienstArten, fahrtMitfahrer, mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { formatDatumZeit } from "./format";
import { formatMannschaft } from "./mannschaft-label";
import { pruefeMitfahrerName } from "./fahrgemeinschaft";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { sendMail } from "./mailer";

// Fahrgemeinschaft, öffentlicher Teil (/eintragen/[token], nur mit dem Freischalt-Link der eigenen Dienste): Eltern/Spieler tragen sich
// selbst als Mitfahrer bei einem Fahrer mit freiem Platz ein, ohne Konto. Gezeigt werden Termin, Fahrer, freie Plätze und Treffpunkt —
// NIE die Namen anderer Mitfahrer. Der Fahrer (mit Konto) bekommt eine kurze Mail. Korrigieren/Entfernen: Dienstwart, Admin, Fahrer.

export type MitfahrAngebot = {
  terminId: string;
  zeit: string;
  beschreibung: string | null;
  ort: string | null;
  mannschaftId: string | null;
  mannschaftLabel: string | null;
  fahrten: { zuordnungId: string; fahrer: string; frei: number; hinweis: string | null }[];
};

export async function ladeMitfahrAngebote(vereinId: string): Promise<MitfahrAngebot[]> {
  return withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .select({
        zuordnungId: terminZuordnungen.id,
        plaetze: terminZuordnungen.plaetze,
        hinweis: terminZuordnungen.fahrtHinweis,
        externerName: terminZuordnungen.externerName,
        name: users.name,
        terminId: termine.id,
        start: termine.start,
        beschreibung: termine.beschreibung,
        ort: termine.ort,
        mannschaftId: termine.mannschaftId,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
      })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
      .innerJoin(dienstArten, eq(dienstArten.id, terminZuordnungen.dienstArtId))
      .leftJoin(users, eq(users.id, terminZuordnungen.userId))
      .leftJoin(mannschaften, eq(mannschaften.id, termine.mannschaftId))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          eq(dienstArten.vereinId, vereinId),
          eq(dienstArten.fahrgemeinschaft, true),
          eq(dienstArten.aktiv, true),
          gte(termine.start, new Date())
        )
      )
      .orderBy(asc(termine.start));
    const mitPlaetzen = zeilen.filter((z) => (z.plaetze ?? 0) > 0);
    if (mitPlaetzen.length === 0) return [];
    const belegt = new Map(
      (
        await tx
          .select({ zuordnungId: fahrtMitfahrer.zuordnungId, anzahl: count() })
          .from(fahrtMitfahrer)
          .where(and(eq(fahrtMitfahrer.vereinId, vereinId), inArray(fahrtMitfahrer.zuordnungId, mitPlaetzen.map((z) => z.zuordnungId))))
          .groupBy(fahrtMitfahrer.zuordnungId)
      ).map((b) => [b.zuordnungId, Number(b.anzahl)])
    );
    const proTermin = new Map<string, MitfahrAngebot>();
    for (const z of mitPlaetzen) {
      const frei = (z.plaetze ?? 0) - (belegt.get(z.zuordnungId) ?? 0);
      if (frei <= 0) continue;
      const angebot = proTermin.get(z.terminId) ?? {
        terminId: z.terminId,
        zeit: formatDatumZeit(z.start),
        beschreibung: z.beschreibung,
        ort: z.ort,
        mannschaftId: z.mannschaftId,
        mannschaftLabel: formatMannschaft(z),
        fahrten: [],
      };
      angebot.fahrten.push({ zuordnungId: z.zuordnungId, fahrer: z.name ?? z.externerName ?? "Fahrer", frei, hinweis: z.hinweis });
      proTermin.set(z.terminId, angebot);
    }
    return [...proTermin.values()];
  });
}

// Liefert eine Fehlermeldung für die Person (oder null bei Erfolg). Prüft alles serverseitig: Fahrt gehört zum Verein, Dienst mit
// Fahrgemeinschaft und aktiv, Termin in der Zukunft, noch ein Platz frei, Name nicht doppelt.
export async function mitfahrenEintragen(vereinId: string, zuordnungId: string, nameRoh: string): Promise<string | null> {
  let name: string;
  try {
    name = pruefeMitfahrerName(nameRoh);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const ergebnis = await withTenant(vereinId, async (tx) => {
    const [fahrt] = await tx
      .select({ plaetze: terminZuordnungen.plaetze, userId: terminZuordnungen.userId, start: termine.start, beschreibung: termine.beschreibung, ort: termine.ort, hinweis: terminZuordnungen.fahrtHinweis })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
      .innerJoin(dienstArten, eq(dienstArten.id, terminZuordnungen.dienstArtId))
      .where(
        and(
          eq(terminZuordnungen.id, zuordnungId),
          eq(termine.vereinId, vereinId),
          eq(dienstArten.vereinId, vereinId),
          eq(dienstArten.fahrgemeinschaft, true),
          eq(dienstArten.aktiv, true),
          gte(termine.start, new Date())
        )
      );
    if (!fahrt) return { fehler: "Diese Fahrt gibt es nicht (mehr)." };
    const vorhandene = await tx
      .select({ name: fahrtMitfahrer.name })
      .from(fahrtMitfahrer)
      .where(and(eq(fahrtMitfahrer.zuordnungId, zuordnungId), eq(fahrtMitfahrer.vereinId, vereinId)));
    if (vorhandene.some((v) => v.name.toLowerCase() === name.toLowerCase())) return { fehler: `${name} fährt hier schon mit.` };
    if (fahrt.plaetze === null || vorhandene.length >= fahrt.plaetze) return { fehler: "Leider ist in diesem Auto kein Platz mehr frei." };
    await tx.insert(fahrtMitfahrer).values({ zuordnungId, vereinId, name });
    return { fehler: null, fahrt };
  });
  if (ergebnis.fehler || !ergebnis.fahrt) return ergebnis.fehler;

  // Kurze Info an den Fahrer, falls er ein Konto hat ("user" ohne RLS: ausdrücklich auf den Verein filtern). Fehler brechen nichts ab.
  const { fahrt } = ergebnis;
  if (fahrt.userId) {
    try {
      const [fahrer, verein] = await withTenant(vereinId, async (tx) => [
        await tx.query.users.findFirst({ where: and(eq(users.id, fahrt.userId!), eq(users.vereinId, vereinId)) }),
        await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { name: true } }),
      ] as const);
      if (fahrer) {
        const inhalt: EmailInhalt = {
          vereinName: verein?.name,
          ueberschrift: `${name} fährt bei dir mit.`,
          zeilen: [`Termin: ${formatDatumZeit(fahrt.start)}`, ...(fahrt.ort ? [`Ort: ${fahrt.ort}`] : []), ...(fahrt.beschreibung ? [fahrt.beschreibung] : [])],
          kleingedrucktes: "Deine Mitfahrer siehst und änderst du im Profil unter „Meine Helferdienste“.",
        };
        await sendMail(fahrer.email, `Neuer Mitfahrer: ${name}`, emailAlsText(inhalt), emailAlsHtml(inhalt));
      }
    } catch (err) {
      console.error("Mail an den Fahrer konnte nicht gesendet werden:", err);
    }
  }
  return null;
}
