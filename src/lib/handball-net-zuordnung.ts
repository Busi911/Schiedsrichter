import "server-only";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { berechneBesetzung, ZEITNEHMER_SEKRETAER_MAX_STANDARD } from "@/lib/besetzung";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { ZUORDENBARE_TYPEN, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

// Nach jedem handball.net-Sync (siehe synchronisiereHandballNetMannschaften
// in handball-net-sync.ts): die von handball.net gemeldete Besetzung (volle
// Namen statt Kürzel, siehe handballNetSchiedsrichter/-Zeitnehmer in
// db/schema.ts) automatisch mit bereits im Verein angelegten
// Funktionsträgern abgleichen und bei einem EXAKTEN Namenstreffer sofort
// zuordnen — wie eine normale Zuordnung durch den Wart (inkl.
// Benachrichtigungsmail an die Person), nur ohne manuellen Klick. Bewusst
// NUR bei exaktem Treffer (siehe findeNamensVorschlag): ein unsicherer
// Vorschlag (z.B. nur Vorname) wird NICHT automatisch übernommen — anders
// als bei der öffentlichen Selbsteintragung (zeitnehmer-eintragen/[token])
// gibt es hier niemanden, der einen unsicheren Vorschlag bestätigen könnte.
// Kein Treffer ist der Normalfall bei Schiedsrichtern (vom DHB gestellt,
// i.d.R. keine Funktionsträger dieses Vereins) und bleibt folgenlos.

type AutomatischerZuordnungKandidat = {
  userId: string;
  name: string | null;
  email: string;
  typ: (typeof ZUORDENBARE_TYPEN)[number];
};

type BestehendeZuordnung = {
  terminId: string;
  userId: string | null;
  funktionstraegerTyp: string;
};

export type AutomatischeZuordnung = {
  terminId: string;
  userId: string;
  email: string;
  rolle: (typeof ZUORDENBARE_TYPEN)[number];
};

// Reiner Abgleich (ohne DB-Zugriff, siehe handball-net-zuordnung.test.ts):
// ermittelt, welche Zuordnungen neu angelegt werden sollen. Schiedsrichter
// und Zeitnehmer/Sekretär kommen bereits in eigenen Feldern von
// handball.net (siehe gruppiereSchiedsrichterUndZeitnehmer in
// handball-net-scraper.ts), Zeitnehmer und Sekretär teilen sich aber ein
// gemeinsames Feld in fester Reihenfolge (erster Name = Zeitnehmer, zweiter
// = Sekretär) statt eigener Rollen-Strings — siehe Kommentar weiter unten.
export function ermittleAutomatischeZuordnungen(
  kandidatenTermine: {
    id: string;
    handballNetSchiedsrichter: string | null;
    handballNetZeitnehmer: string | null;
  }[],
  bestehendeZuordnungen: BestehendeZuordnung[],
  funktionstraegerListe: AutomatischerZuordnungKandidat[],
  zeitnehmerSekretaerMax = ZEITNEHMER_SEKRETAER_MAX_STANDARD
): AutomatischeZuordnung[] {
  const ergebnis: AutomatischeZuordnung[] = [];

  for (const termin of kandidatenTermine) {
    // Läuft während der Verarbeitung dieses EINEN Termins mit, damit z.B.
    // der zweite Schiedsrichter im Gespann die durch den ersten frisch
    // ermittelte Zuordnung schon als "bereits belegt" mitzählt (sonst
    // würde berechneBesetzung unten mit veralteten Zahlen rechnen).
    const zuordnungenDiesesTermins = bestehendeZuordnungen.filter(
      (z) => z.terminId === termin.id
    );

    const versucheZuordnen = (
      name: string,
      rollenReihenfolge: readonly (typeof ZUORDENBARE_TYPEN)[number][]
    ) => {
      for (const rolle of rollenReihenfolge) {
        const kandidatenFuerRolle = funktionstraegerListe.filter((f) => f.typ === rolle);
        const { exakt } = findeNamensVorschlag(
          name,
          kandidatenFuerRolle.map((f) => ({ userId: f.userId, name: f.name }))
        );
        if (!exakt) continue;
        const treffer = kandidatenFuerRolle.find((f) => f.userId === exakt.userId);
        if (!treffer) continue;

        const bereitsZugeordnet = zuordnungenDiesesTermins.some(
          (z) => z.userId === treffer.userId && z.funktionstraegerTyp === rolle
        );
        if (bereitsZugeordnet) return; // schon zugeordnet — nichts weiter zu tun für diesen Namen

        const besetzung = berechneBesetzung(
          zuordnungenDiesesTermins.map((z) => ({ funktionstraegerTyp: z.funktionstraegerTyp })),
          false,
          undefined,
          zeitnehmerSekretaerMax
        );
        const rolleVoll =
          rolle === "schiedsrichter" ? besetzung.schiriVoll : besetzung.zeitnehmerSekretaerVoll;
        if (rolleVoll) continue; // diese Rolle ist voll — nächste Rolle für denselben Namen probieren

        ergebnis.push({ terminId: termin.id, userId: treffer.userId, email: treffer.email, rolle });
        zuordnungenDiesesTermins.push({
          terminId: termin.id,
          userId: treffer.userId,
          funktionstraegerTyp: rolle,
        });
        return; // Name erfolgreich zugeordnet
      }
    };

    if (termin.handballNetSchiedsrichter) {
      for (const roherName of termin.handballNetSchiedsrichter.split(",")) {
        const name = roherName.trim();
        if (name) versucheZuordnen(name, ["schiedsrichter"]);
      }
    }

    if (termin.handballNetZeitnehmer) {
      const namen = termin.handballNetZeitnehmer
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      // handball.net meldet Zeitnehmer und Sekretär in fester Reihenfolge im
      // selben Sammel-Feld (siehe gruppiereSchiedsrichterUndZeitnehmer in
      // handball-net-scraper.ts, das beide unter einer Rolle zusammenfasst):
      // der ERSTE Name ist der Zeitnehmer (fast immer eine Person des
      // eigenen Vereins), der ZWEITE der Sekretär (ab Oberliga vom Verband,
      // in der Bundesliga vom Bund gestellt — i.d.R. kein Funktionsträger
      // dieses Vereins, ein fehlender Treffer ist hier also der Normalfall).
      // Die jeweils andere Rolle bleibt als Fallback zweite Wahl, falls die
      // Person im System ausnahmsweise nur unter der anderen Rolle
      // angelegt ist.
      namen.forEach((name, index) => {
        const rollenReihenfolge =
          index === 0
            ? (["zeitnehmer", "sekretaer"] as const)
            : (["sekretaer", "zeitnehmer"] as const);
        versucheZuordnen(name, rollenReihenfolge);
      });
    }
  }

  return ergebnis;
}

export async function ordneHandballNetBesetzungZu(
  vereinId: string,
  terminIds: string[]
): Promise<{ zuordnungenErstellt: number }> {
  if (terminIds.length === 0) return { zuordnungenErstellt: 0 };

  const { zuordnungen, vereinName } = await withTenant(vereinId, async (tx) => {
    const kandidatenTermine = await tx
      .select({
        id: termine.id,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        handballNetSchiedsrichter: termine.handballNetSchiedsrichter,
        handballNetZeitnehmer: termine.handballNetZeitnehmer,
      })
      .from(termine)
      .where(
        and(
          eq(termine.vereinId, vereinId),
          inArray(termine.id, terminIds),
          or(
            isNotNull(termine.handballNetSchiedsrichter),
            isNotNull(termine.handballNetZeitnehmer)
          )
        )
      );
    if (kandidatenTermine.length === 0) {
      return { zuordnungen: [] as (AutomatischeZuordnung & { termin: (typeof kandidatenTermine)[number] })[], vereinName: null };
    }

    const bestehendeZuordnungen = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        userId: terminZuordnungen.userId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
      })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, kandidatenTermine.map((t) => t.id)));

    const funktionstraegerListe = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        typ: funktionstraegerRollen.typ,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          inArray(funktionstraegerRollen.typ, [...ZUORDENBARE_TYPEN]),
          eq(funktionstraegerRollen.aktiv, true)
        )
      );

    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });

    const automatischeZuordnungen = ermittleAutomatischeZuordnungen(
      kandidatenTermine,
      bestehendeZuordnungen,
      // inArray oben grenzt zur Laufzeit bereits auf ZUORDENBARE_TYPEN ein —
      // drizzle kennt den vollen funktionstraegerTypEnum-Typ der Spalte und
      // engt ihn dadurch nicht automatisch ein.
      funktionstraegerListe as AutomatischerZuordnungKandidat[],
      verein?.zeitnehmerSekretaerMax
    );
    if (automatischeZuordnungen.length === 0) {
      return { zuordnungen: [] as (AutomatischeZuordnung & { termin: (typeof kandidatenTermine)[number] })[], vereinName: null };
    }

    await tx.insert(terminZuordnungen).values(
      automatischeZuordnungen.map((z) => ({
        terminId: z.terminId,
        userId: z.userId,
        funktionstraegerTyp: z.rolle,
        quelle: "handball_net_uebernommen" as const,
      }))
    );

    const terminById = new Map(kandidatenTermine.map((t) => [t.id, t]));
    return {
      zuordnungen: automatischeZuordnungen.map((z) => ({
        ...z,
        termin: terminById.get(z.terminId)!,
      })),
      vereinName: verein?.name ?? "HandballerPate",
    };
  });

  // Best effort außerhalb der Transaktion (analog zu zuordnen in
  // admin/zuordnung/actions.ts): ein Mail-Fehler soll die bereits erfolgten
  // Zuordnungen nicht rückgängig machen oder den Sync als fehlgeschlagen
  // ausweisen.
  for (const z of zuordnungen) {
    const mailParams = {
      vereinName: vereinName ?? "HandballerPate",
      ...zuordnungsMailInhalt(z.rolle, z.termin),
    };
    try {
      await sendMail(
        z.email,
        "Neue Termin-Zuordnung",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error(
        "Zuordnungs-Mail (automatische handball.net-Zuordnung) konnte nicht gesendet werden:",
        err
      );
    }
  }

  return { zuordnungenErstellt: zuordnungen.length };
}
