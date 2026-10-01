import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import {
  ligaGruppen,
  ligaMannschaften,
  ligaSpiele,
  ligaTabellenzeilen,
  ligaVereinLogos,
  ligaTeilnahmen,
  ligaVereine,
  vereine,
} from "@/db/schema";
import { saisonLabel } from "@/lib/saison";

// Lesezugriff für die öffentlichen Seiten /verein/... (ohne Session, daher
// adminDb mit ausdrücklichem Filter, wie bei /turnier/[token]). Ausgeliefert
// werden nur die öffentlichen Sportdaten der liga_*-Tabellen — keine
// Mandanten-/Personendaten.

import type { SpielAnsicht } from "./liga-spiele-hilfen";
export {
  hatErgebnis,
  istAnstehend,
  istVergangen,
  sortiereChronologisch,
  type SpielAnsicht,
} from "./liga-spiele-hilfen";
import { hatErgebnis, istAnstehend, sortiereChronologisch } from "./liga-spiele-hilfen";

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

// Vereine im Vorbereitungs-Modus (Systemadmin richtet sie im Hintergrund ein,
// siehe lib/treuhand.ts) sind öffentlich nicht erreichbar — nur der
// einrichtende Systemadmin selbst darf sich die Seite ansehen.
async function darfVorschauSehen(vereinId: string): Promise<boolean> {
  const { auth } = await import("@/auth");
  const { holeTreuhandKontext } = await import("./treuhand");
  const session = await auth();
  if (!session?.user?.istSystemAdmin) return false;
  return (await holeTreuhandKontext(session.user.id))?.vereinId === vereinId;
}

export const holeVerein = cache(async (slug: string) => {
  const ligaVerein = await mitColdStartRetry(() =>
    adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.slug, slug) })
  );
  if (!ligaVerein) return undefined;
  const [verein] = await mitColdStartRetry(() =>
    adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, ligaVerein.vereinId))
  );
  if (verein?.status === "vorbereitung" && !(await darfVorschauSehen(ligaVerein.vereinId))) {
    return undefined;
  }
  return ligaVerein;
});

// Nur Zeitstempel (Cache-Buster der Bild-URL) und Farbton — das Bild selbst
// wird erst von den Logo-/Icon-Routen geladen. Ohne Logo: beides null.
export const holeVereinsDesign = cache(
  async (ligaVereinId: string): Promise<{ logoVersion: number | null; farbton: number | null }> => {
    const zeile = await mitColdStartRetry(() =>
      adminDb.query.ligaVereinLogos.findFirst({
        where: eq(ligaVereinLogos.ligaVereinId, ligaVereinId),
        columns: { aktualisiertAm: true, farbton: true },
      })
    );
    return { logoVersion: zeile ? zeile.aktualisiertAm.getTime() : null, farbton: zeile?.farbton ?? null };
  }
);

export const holeLogoVersion = async (ligaVereinId: string) =>
  (await holeVereinsDesign(ligaVereinId)).logoVersion;

export const holeLogoPng = async (ligaVereinId: string): Promise<Buffer | null> => {
  const zeile = await mitColdStartRetry(() =>
    adminDb.query.ligaVereinLogos.findFirst({ where: eq(ligaVereinLogos.ligaVereinId, ligaVereinId) })
  );
  return zeile?.png ?? null;
};

// Nur Vereine, die übergeben/aktiv sind (nicht im Vorbereitungs-Modus).
export const holeAlleVereine = async () =>
  mitColdStartRetry(() =>
    adminDb
      .select({ id: ligaVereine.id, name: ligaVereine.name, slug: ligaVereine.slug })
      .from(ligaVereine)
      .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
      .where(eq(vereine.status, "aktiv"))
      .orderBy(asc(ligaVereine.name))
  );

export const holeAlleVereineFuerSitemap = async () =>
  mitColdStartRetry(() =>
    adminDb
      .select({
        id: ligaVereine.id,
        slug: ligaVereine.slug,
        spieleSynchronisiertAm: ligaVereine.spieleSynchronisiertAm,
      })
      .from(ligaVereine)
      .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
      .where(eq(vereine.status, "aktiv"))
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
          eq(ligaTeilnahmen.aktiv, true),
          // Freundschaftsspiele (eigene Mini-Gruppen) haben weder Tabelle noch
          // Platz — ihre Spiele kommen unten dazu.
          eq(ligaGruppen.istFreundschaft, false)
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

    // Freundschaftsspiele der Mannschaften: in den Spielzeilen steht bei der
    // eigenen Seite die Teamtable der regulären Teilnahme (siehe
    // nuliga/sync.ts, synchronisiereFreundschaftsspiele).
    const fsTeilnahmen = await adminDb
      .select({ mannschaftId: ligaTeilnahmen.mannschaftId, gruppeId: ligaTeilnahmen.gruppeId })
      .from(ligaTeilnahmen)
      .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
      .where(
        and(
          inArray(ligaTeilnahmen.mannschaftId, auswahl.map((z) => z.m.id)),
          eq(ligaTeilnahmen.aktiv, true),
          eq(ligaGruppen.istFreundschaft, true)
        )
      );
    const fsGruppen = [...new Set(fsTeilnahmen.map((f) => f.gruppeId))];
    const fsSpiele = fsGruppen.length
      ? await adminDb.query.ligaSpiele.findMany({
          where: inArray(ligaSpiele.gruppeId, fsGruppen),
          orderBy: [asc(ligaSpiele.datum), asc(ligaSpiele.uhrzeit)],
        })
      : [];

    const jetzt = new Date();
    return auswahl.map(({ m, t, g }) => {
      const tt = t.nuligaTeamtableId;
      const fsEigene = new Set(fsTeilnahmen.filter((f) => f.mannschaftId === m.id).map((f) => f.gruppeId));
      const eigeneSpiele = sortiereChronologisch([
        ...(tt
          ? spiele.filter(
              (s) => s.gruppeId === g.id && (s.heimTeamtableId === tt || s.gastTeamtableId === tt)
            )
          : []),
        ...(tt ? fsSpiele.filter((s) => fsEigene.has(s.gruppeId)) : []),
      ]);
      const zeile = tt ? tabelle.find((x) => x.gruppeId === g.id && x.nuligaTeamtableId === tt) : null;
      return {
        id: m.id,
        slug: m.slug,
        name: m.anzeigenameEigen ?? m.name,
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

// Zurückgezogene Mannschaften (nuLiga: "zurückgezogen am …" statt Statistik,
// siehe ligaTabellenzeilen.zurueckgezogen) bleiben in der DB, damit der Sync
// sie wiedererkennt — in der öffentlichen Tabelle erscheinen sie aber nicht.
export const holeTabelle = cache(async (gruppeId: string) =>
  mitColdStartRetry(() =>
    adminDb.query.ligaTabellenzeilen.findMany({
      where: and(
        eq(ligaTabellenzeilen.gruppeId, gruppeId),
        eq(ligaTabellenzeilen.zurueckgezogen, false)
      ),
      orderBy: [asc(ligaTabellenzeilen.rang)],
    })
  )
);

export const holeGruppe = cache(async (gruppeId: string) =>
  mitColdStartRetry(() =>
    adminDb.query.ligaGruppen.findFirst({ where: eq(ligaGruppen.id, gruppeId) })
  )
);

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
