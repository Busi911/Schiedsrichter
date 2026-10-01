import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import {
  favoriten,
  ligaGruppen,
  ligaMannschaften,
  ligaSpiele,
  ligaTabellenzeilen,
  ligaTeilnahmen,
  ligaVereine,
} from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import { saisonLabel } from "@/lib/saison";

// Lesezugriff für die öffentlichen Seiten /verein/... (ohne Session, daher
// adminDb mit ausdrücklichem Filter, wie bei /turnier/[token]). Ausgeliefert
// werden nur die öffentlichen Sportdaten der liga_*-Tabellen — keine
// Mandanten-/Personendaten.

export type SpielAnsicht = typeof ligaSpiele.$inferSelect;

export type MannschaftAnsicht = {
  id: string;
  slug: string;
  name: string;
  kategorie: (typeof ligaMannschaften.$inferSelect)["kategorie"];
  altersklasse: string | null;
  nummer: number;
  teilnahmeId: string;
  gruppeId: string;
  teamtableId: string | null;
  ligaName: string;
  istMeldeliste: boolean;
  rang: number | null;
  punkte: { plus: number; minus: number } | null;
  spiele: SpielAnsicht[]; // alle Spiele der Mannschaft, chronologisch
  naechstesSpiel: SpielAnsicht | null;
};

const ERGEBNIS_STATI = new Set(["gespielt", "nicht_angetreten"]);

export function hatErgebnis(s: SpielAnsicht): boolean {
  return s.toreHeim !== null && s.toreGast !== null;
}

// Bereits gespielt = Ergebnis vorhanden bzw. gewertet. Alles andere mit
// Datum ab heute gilt als anstehend (abgesagte Spiele bleiben sichtbar, mit
// Status-Hinweis, bis ein neuer Termin feststeht).
export function istVergangen(s: SpielAnsicht): boolean {
  return hatErgebnis(s) || ERGEBNIS_STATI.has(s.status);
}

export function istAnstehend(s: SpielAnsicht, jetzt: Date): boolean {
  if (istVergangen(s)) return false;
  return s.datum >= tagKey(jetzt);
}

export function sortiereChronologisch<T extends SpielAnsicht>(spiele: T[]): T[] {
  return [...spiele].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      (a.uhrzeit ?? "99:99").localeCompare(b.uhrzeit ?? "99:99") ||
      a.spielnummer - b.spielnummer
  );
}

export const holeVerein = cache(async (slug: string) =>
  mitColdStartRetry(() =>
    adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.slug, slug) })
  )
);

export const holeAlleVereineFuerSitemap = async () =>
  mitColdStartRetry(() =>
    adminDb.query.ligaVereine.findMany({ columns: { id: true, slug: true, spieleSynchronisiertAm: true } })
  );

// Aktive Mannschaften des Vereins (aktuelle Saison) samt Tabellenstand und
// Spielen — ein Aufruf für alle Seiten, per cache() je Request geteilt.
export const holeMannschaften = cache(async (ligaVereinId: string): Promise<MannschaftAnsicht[]> => {
  return mitColdStartRetry(async () => {
    const zeilen = await adminDb
      .select({ m: ligaMannschaften, t: ligaTeilnahmen, g: ligaGruppen })
      .from(ligaMannschaften)
      .innerJoin(ligaTeilnahmen, eq(ligaTeilnahmen.mannschaftId, ligaMannschaften.id))
      .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
      .where(
        and(
          eq(ligaMannschaften.ligaVereinId, ligaVereinId),
          eq(ligaMannschaften.aktiv, true),
          eq(ligaTeilnahmen.aktiv, true)
        )
      );
    if (zeilen.length === 0) return [];

    // Pro Mannschaft nur die Teilnahme der aktuellsten Saison.
    const proMannschaft = new Map<string, (typeof zeilen)[number]>();
    for (const z of zeilen) {
      const vorher = proMannschaft.get(z.m.id);
      if (!vorher || z.t.saison > vorher.t.saison) proMannschaft.set(z.m.id, z);
    }
    const auswahl = [...proMannschaft.values()];

    const gruppenIds = [...new Set(auswahl.map((z) => z.g.id))];
    const tts = auswahl.map((z) => z.t.nuligaTeamtableId).filter((x): x is string => !!x);

    const [tabelle, spiele] = await Promise.all([
      adminDb.query.ligaTabellenzeilen.findMany({
        where: inArray(ligaTabellenzeilen.gruppeId, gruppenIds),
      }),
      tts.length
        ? adminDb.query.ligaSpiele.findMany({
            where: and(
              inArray(ligaSpiele.gruppeId, gruppenIds),
              or(inArray(ligaSpiele.heimTeamtableId, tts), inArray(ligaSpiele.gastTeamtableId, tts))
            ),
            orderBy: [asc(ligaSpiele.datum), asc(ligaSpiele.uhrzeit)],
          })
        : Promise.resolve([] as SpielAnsicht[]),
    ]);

    const jetzt = new Date();
    return auswahl.map(({ m, t, g }) => {
      const tt = t.nuligaTeamtableId;
      const eigeneSpiele = sortiereChronologisch(
        tt
          ? spiele.filter(
              (s) => s.gruppeId === g.id && (s.heimTeamtableId === tt || s.gastTeamtableId === tt)
            )
          : []
      );
      const zeile = tt ? tabelle.find((x) => x.gruppeId === g.id && x.nuligaTeamtableId === tt) : null;
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        kategorie: m.kategorie,
        altersklasse: m.altersklasse,
        nummer: m.nummer,
        teilnahmeId: t.id,
        gruppeId: g.id,
        teamtableId: tt,
        ligaName: g.ligaName,
        istMeldeliste: g.istMeldeliste,
        rang: zeile?.rang ?? t.rang,
        punkte: zeile
          ? { plus: zeile.punktePlus ?? 0, minus: zeile.punkteMinus ?? 0 }
          : t.punktePlus !== null
            ? { plus: t.punktePlus, minus: t.punkteMinus ?? 0 }
            : null,
        spiele: eigeneSpiele,
        naechstesSpiel: eigeneSpiele.find((s) => istAnstehend(s, jetzt)) ?? null,
      };
    });
  });
});

export const holeTabelle = cache(async (gruppeId: string) =>
  mitColdStartRetry(() =>
    adminDb.query.ligaTabellenzeilen.findMany({
      where: eq(ligaTabellenzeilen.gruppeId, gruppeId),
      orderBy: [asc(ligaTabellenzeilen.rang)],
    })
  )
);

export const holeGruppe = cache(async (gruppeId: string) =>
  mitColdStartRetry(() =>
    adminDb.query.ligaGruppen.findFirst({ where: eq(ligaGruppen.id, gruppeId) })
  )
);

// Favoriten des Nutzers (null/leer bei anonymen Besuchern).
export async function holeFavoritenIds(userId: string | undefined) {
  if (!userId) return { vereine: new Set<string>(), mannschaften: new Set<string>() };
  const zeilen = await mitColdStartRetry(() =>
    adminDb.query.favoriten.findMany({ where: eq(favoriten.userId, userId) })
  );
  return {
    vereine: new Set(zeilen.map((z) => z.ligaVereinId).filter((x): x is string => !!x)),
    mannschaften: new Set(zeilen.map((z) => z.ligaMannschaftId).filter((x): x is string => !!x)),
  };
}

// Heimbilanz aus Sicht der Mannschaft: "S" | "U" | "N" für die letzten Spiele.
export function formKurve(m: MannschaftAnsicht, anzahl = 5): ("S" | "U" | "N")[] {
  const tt = m.teamtableId;
  return m.spiele
    .filter((s) => hatErgebnis(s))
    .slice(-anzahl)
    .map((s) => {
      const eigenHeim = s.heimTeamtableId === tt;
      const eigen = eigenHeim ? s.toreHeim! : s.toreGast!;
      const gegner = eigenHeim ? s.toreGast! : s.toreHeim!;
      return eigen > gegner ? "S" : eigen === gegner ? "U" : "N";
    });
}

export const AKTUELLE_SAISON = () => saisonLabel(new Date());

export const KATEGORIE_GRUPPEN: { schluessel: string; titel: string; kategorien: string[] }[] = [
  { schluessel: "herren", titel: "Herren", kategorien: ["herren"] },
  { schluessel: "damen", titel: "Damen", kategorien: ["damen"] },
  { schluessel: "jugend_m", titel: "Männliche Jugend", kategorien: ["jugend_maennlich"] },
  { schluessel: "jugend_w", titel: "Weibliche Jugend", kategorien: ["jugend_weiblich"] },
  { schluessel: "kinder", titel: "Kinder / gemischte Jugend", kategorien: ["kinder", "sonstige"] },
];

export function gruppiereMannschaften(mannschaften: MannschaftAnsicht[]) {
  return KATEGORIE_GRUPPEN.map((g) => ({
    ...g,
    mannschaften: mannschaften
      .filter((m) => g.kategorien.includes(m.kategorie))
      .sort(
        (a, b) =>
          (a.altersklasse ?? "").localeCompare(b.altersklasse ?? "") || a.nummer - b.nummer
      ),
  })).filter((g) => g.mannschaften.length > 0);
}
