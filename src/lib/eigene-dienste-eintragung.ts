import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { withTenant } from "@/db";
import { dienstArten, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { bedarfEigenerDienst, bedarfSchluessel } from "./eigene-dienste";
import { ladeEigeneDiensteKontext } from "./eigene-dienste-daten";
import { mehrfachZuordnungsMailInhalt } from "./zuordnung";
import { sendMail } from "./mailer";
import { terminMailHtml, terminMailText } from "./termin-mail";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

// Öffentliche Selbsteintragung für eigene Dienste (dritter Teil von /eintragen/[token], freigeschaltet vom Dienstwart über
// vereine.diensteSelbstanmeldungToken). Bewusst einfacher als bei Zeitnehmer/Ordner (lib/selbsteintragung.ts): eigene Dienste haben keine
// Rollen, also gibt es keinen Namensabgleich mit Funktionsträgern und keine Bestätigung durch den Wart — ein Eintrag zählt sofort.
// Es wird auch kein Konto angelegt: eingeloggte Personen werden direkt erkannt, eine angegebene E-Mail verknüpft nur, wenn sie zu einer
// Person DIESES Vereins gehört (dann gibt es eine Bestätigungsmail), sonst wird der Name ohne Login eingetragen.

export const EIGEN_PREFIX = "eigen:";

export function eigeneRolle(dienstArtId: string): string {
  return `${EIGEN_PREFIX}${dienstArtId}`;
}

export function dienstArtIdAusRolle(rolle: string): string | null {
  return rolle.startsWith(EIGEN_PREFIX) ? rolle.slice(EIGEN_PREFIX.length) || null : null;
}

export async function eigeneDiensteSelbstEintragen(eingabe: {
  vereinId: string;
  dienstArtId: string;
  terminIds: string[];
  name: string;
  email: string;
  // Gesetzt, wenn die Seite eine Session dieses Vereins erkannt hat (dann zählt die Person aus der Session, nicht das Formular).
  eingeloggtUserId: string | null;
}): Promise<MehrfachEintragErgebnis> {
  const { vereinId, dienstArtId, terminIds } = eingabe;
  const gesamt = terminIds.length;
  const name = eingabe.name.trim().slice(0, 80);
  if (!eingabe.eingeloggtUserId && !name) return { eingetragen: 0, gesamt, fehler: "Name ist erforderlich." };

  const vorbereitung = await withTenant(vereinId, async (tx) => {
    const art = await tx.query.dienstArten.findFirst({ where: and(eq(dienstArten.id, dienstArtId), eq(dienstArten.vereinId, vereinId)) });
    if (!art || !art.aktiv) return null;
    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
    let person: { id: string; email: string; name: string | null } | null = null;
    if (eingabe.eingeloggtUserId) {
      person = (await tx.query.users.findFirst({ where: and(eq(users.id, eingabe.eingeloggtUserId), eq(users.vereinId, vereinId)) })) ?? null;
    } else if (eingabe.email && !verein?.istDemo) {
      // Nur verknüpfen, nie ein Konto anlegen; "user" hat keine RLS, daher der ausdrückliche Vereinsfilter.
      person =
        (await tx.query.users.findFirst({ where: and(eq(users.email, eingabe.email.trim().toLowerCase()), eq(users.vereinId, vereinId)) })) ?? null;
    }
    return { art, verein, person };
  });
  if (!vorbereitung) return { eingetragen: 0, gesamt, fehler: "Dieser Dienst ist nicht (mehr) freigeschaltet." };
  const { art, verein, person } = vorbereitung;

  const fehler: string[] = [];
  const eingetrageneTermine: (typeof termine.$inferSelect)[] = [];
  // Je Termin eine eigene Transaktion: ein voller Termin hält die anderen nicht auf.
  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(vereinId, async (tx) => {
        const t = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId), gte(termine.start, new Date())),
        });
        if (!t) throw new Error("Termin nicht gefunden oder schon vorbei.");
        const kontext = await ladeEigeneDiensteKontext(tx, vereinId, [terminId]);
        const regel = kontext.arten.find((a) => a.id === dienstArtId);
        const bedarf = regel ? bedarfEigenerDienst(regel, t, kontext.overrides.get(bedarfSchluessel(terminId, dienstArtId))) : 0;
        const bisher = await tx
          .select({ userId: terminZuordnungen.userId, externerName: terminZuordnungen.externerName })
          .from(terminZuordnungen)
          .where(
            and(
              eq(terminZuordnungen.terminId, terminId),
              eq(terminZuordnungen.funktionstraegerTyp, "eigener_dienst"),
              eq(terminZuordnungen.dienstArtId, dienstArtId)
            )
          );
        const doppelt = bisher.some((b) =>
          person ? b.userId === person.id : !!b.externerName && b.externerName.toLowerCase() === name.toLowerCase()
        );
        if (doppelt) throw new Error("Du bist hier schon eingetragen.");
        if (bisher.length >= bedarf) throw new Error("Schon alle Plätze besetzt.");
        await tx.insert(terminZuordnungen).values({
          terminId,
          userId: person?.id ?? null,
          externerName: person ? null : name,
          funktionstraegerTyp: "eigener_dienst",
          dienstArtId,
          quelle: eingabe.eingeloggtUserId ? "selbst_angemeldet" : "selbst_eingetragen_oeffentlich",
        });
        return t;
      });
      eingetrageneTermine.push(termin);
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Bestätigung nur an eine Person des Vereins (eine Mail für alle Termine); ohne Konto gibt es keine Adresse.
  if (person && eingetrageneTermine.length > 0) {
    const inhalt = mehrfachZuordnungsMailInhalt(art.name, eingetrageneTermine);
    const mailParams = {
      vereinName: verein?.name ?? "HandballerPate",
      ...inhalt,
      zeilen: art.beschreibung ? [...inhalt.zeilen, { text: `Hinweis: ${art.beschreibung}`, neueGruppe: true }] : inhalt.zeilen,
    };
    try {
      await sendMail(person.email, `Eingetragen als ${art.name}`, terminMailText(mailParams), terminMailHtml(mailParams));
    } catch (err) {
      console.error("Bestätigungsmail (eigener Dienst) konnte nicht gesendet werden:", err);
    }
  }

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt,
    fehler: fehler.length ? [...new Set(fehler)].map((f) => `${art.name}: ${f}`).join(" | ") : null,
  };
}
