import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaSpiele, termine } from "@/db/schema";
import { ermittleSichereVerknuepfungen } from "@/lib/hallenplan-abgleich-laden";
import { baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { parseAnsetzungen } from "@/lib/nuliga/parsers/ansetzung";
import type { HoleHtml } from "@/lib/nuliga/client";

export type AnsetzungsVergleich = {
  geprueft: number; // verknüpfte nuLiga-Termine, die verglichen wurden
  gleich: number; // Kürzel im Hallenplan und in den öffentlichen Daten identisch
  verschieden: number;
  nurHallenplan: number; // im Termin vorhanden, öffentlich (noch) nicht
  nurOeffentlich: number; // öffentlich vorhanden, im Termin nicht (neu angesetzt)
  beideLeer: number;
  gruppenGeladen: number;
  gruppenFehler: number;
  beispiele: { termin: string; hallenplan: string | null; oeffentlich: string | null }[];
};

// NUR LESEND: lädt die Gruppenseiten der Spiele, die mit einem Termin dieses Vereins
// verknüpft sind (nuLiga), und vergleicht das angesetzte Schiedsrichter-Kürzel mit dem
// des Termins (aus dem Hallenplan-Import). Schreibt nichts, speichert kein Kürzel.
export async function vergleicheAnsetzung(vereinId: string, holeHtml: HoleHtml): Promise<AnsetzungsVergleich> {
  const sichere = await ermittleSichereVerknuepfungen(vereinId);
  const leer: AnsetzungsVergleich = {
    geprueft: 0, gleich: 0, verschieden: 0, nurHallenplan: 0, nurOeffentlich: 0, beideLeer: 0,
    gruppenGeladen: 0, gruppenFehler: 0, beispiele: [],
  };
  if (sichere.length === 0) return leer;

  const spiele = await adminDb
    .select({
      id: ligaSpiele.id,
      nummer: ligaSpiele.spielnummer,
      datum: ligaSpiele.datum,
      gruppeId: ligaSpiele.gruppeId,
      quelle: ligaSpiele.quelle,
      verband: ligaGruppen.verband,
      gruppenNr: ligaGruppen.nuligaGroupId,
      championship: ligaGruppen.championship,
    })
    .from(ligaSpiele)
    .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaSpiele.gruppeId))
    .where(inArray(ligaSpiele.id, sichere.map((p) => p.spielId)));
  const spielNachId = new Map(spiele.map((s) => [s.id, s]));
  const termineZeilen = await adminDb
    .select({ id: termine.id, kuerzel: termine.nuligaSchiedsrichterKuerzel, start: termine.start })
    .from(termine)
    .where(and(eq(termine.vereinId, vereinId), inArray(termine.id, sichere.map((p) => p.terminId))));
  const terminNachId = new Map(termineZeilen.map((t) => [t.id, t]));

  // je Gruppe EINE Seite laden (sequenziell, nuLiga-Client hält den Mindestabstand)
  const gruppen = new Map<string, (typeof spiele)[number]>();
  for (const s of spiele) if (s.quelle === "nuliga") gruppen.set(s.gruppeId, s);
  const ansetzungen = new Map<string, Map<number, string>>();
  const out = { ...leer };
  for (const [gruppeId, g] of gruppen) {
    try {
      const html = await holeHtml(baueNuligaUrl(g.verband, "groupPage", { championship: g.championship, group: g.gruppenNr }));
      ansetzungen.set(gruppeId, new Map(parseAnsetzungen(html).map((a) => [a.spielnummer, a.kuerzel])));
      out.gruppenGeladen++;
    } catch {
      out.gruppenFehler++;
    }
  }

  for (const p of sichere) {
    const s = spielNachId.get(p.spielId);
    const t = terminNachId.get(p.terminId);
    const karte = s && ansetzungen.get(s.gruppeId);
    if (!s || !t || s.quelle !== "nuliga" || s.nummer === null || !karte) continue;
    out.geprueft++;
    const hp = t.kuerzel?.trim() || null;
    const oe = karte.get(s.nummer) ?? null;
    const norm = (x: string | null) => x?.toLowerCase().replace(/[\s.]/g, "") ?? null;
    if (!hp && !oe) out.beideLeer++;
    else if (norm(hp) === norm(oe)) out.gleich++;
    else {
      if (hp && !oe) out.nurHallenplan++;
      else if (!hp && oe) out.nurOeffentlich++;
      else out.verschieden++;
      if (out.beispiele.length < 8) out.beispiele.push({ termin: `${s.datum} · Nr. ${s.nummer}`, hallenplan: hp, oeffentlich: oe });
    }
  }
  return out;
}
