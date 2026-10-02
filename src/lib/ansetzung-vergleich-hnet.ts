import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaSpiele, termine } from "@/db/schema";
import { ermittleSichereVerknuepfungen } from "@/lib/hallenplan-abgleich-laden";
import { gruppiereSchiedsrichterUndZeitnehmer } from "@/lib/handball-net-scraper";
import { holeAlleSeiten } from "@/lib/handball-net/sync";
import type { HoleJson } from "@/lib/handball-net/client";
import type { AnsetzungsVergleich } from "@/lib/ansetzung-vergleich";

const TAG_MS = 24 * 3600_000;
const datumBerlin = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const norm = (x: string | null) => x?.toLowerCase().replace(/\s+/g, " ").trim() || null;

// NUR LESEND: Gegenstück zu vergleicheAnsetzung für handball.net. Je Phase eine paginierte Abfrage
// (künftige Spiele), Zuordnung über liga_spiel.spielcode; verglichen werden Schiedsrichter und
// Zeitnehmer (Namen) mit denen der verknüpften Termine (aus dem Hallenplan-Import). Schreibt nichts.
export async function vergleicheAnsetzungHandballNet(vereinId: string, holeJson: HoleJson, jetzt = new Date()): Promise<AnsetzungsVergleich> {
  const out: AnsetzungsVergleich = {
    geprueft: 0, gleich: 0, verschieden: 0, nurHallenplan: 0, nurOeffentlich: 0, beideLeer: 0,
    gruppenGeladen: 0, gruppenFehler: 0, beispiele: [],
  };
  const sichere = await ermittleSichereVerknuepfungen(vereinId);
  if (sichere.length === 0) return out;
  const heute = datumBerlin(jetzt);
  const bis = datumBerlin(new Date(jetzt.getTime() + 400 * TAG_MS));

  const spiele = await adminDb
    .select({
      id: ligaSpiele.id,
      code: ligaSpiele.spielcode,
      datum: ligaSpiele.datum,
      gruppeId: ligaSpiele.gruppeId,
      phaseId: ligaGruppen.nuligaGroupId,
    })
    .from(ligaSpiele)
    .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaSpiele.gruppeId))
    .where(and(inArray(ligaSpiele.id, sichere.map((p) => p.spielId)), eq(ligaGruppen.quelle, "handball_net"), gte(ligaSpiele.datum, heute)));
  if (spiele.length === 0) return out;
  const spielNachId = new Map(spiele.map((s) => [s.id, s]));
  const termineZeilen = await adminDb
    .select({ id: termine.id, sr: termine.handballNetSchiedsrichter, zn: termine.handballNetZeitnehmer })
    .from(termine)
    .where(and(eq(termine.vereinId, vereinId), inArray(termine.id, sichere.map((p) => p.terminId))));
  const terminNachId = new Map(termineZeilen.map((t) => [t.id, t]));

  const phasen = new Map<string, string>();
  for (const s of spiele) phasen.set(s.gruppeId, s.phaseId);
  const nachGruppe = new Map<string, Map<string, { schiedsrichter: string | null; zeitnehmer: string | null }>>();
  for (const [gruppeId, phaseId] of phasen) {
    try {
      const karte = new Map<string, { schiedsrichter: string | null; zeitnehmer: string | null }>();
      const roh = await holeAlleSeiten(holeJson, `/api/new/matches?phase_id=${encodeURIComponent(phaseId)}&date_from=${heute}&date_to=${bis}`);
      for (const r of roh) {
        const m = r as { code?: unknown; referees?: unknown };
        if (typeof m?.code === "string" && m.code) karte.set(m.code, gruppiereSchiedsrichterUndZeitnehmer(m.referees));
      }
      nachGruppe.set(gruppeId, karte);
      out.gruppenGeladen++;
    } catch {
      out.gruppenFehler++;
    }
  }

  const text = (sr: string | null, zn: string | null) => {
    const teile = [sr && `SR ${sr}`, zn && `ZN ${zn}`].filter(Boolean);
    return teile.length ? teile.join(" · ") : null;
  };
  for (const p of sichere) {
    const s = spielNachId.get(p.spielId);
    const t = terminNachId.get(p.terminId);
    const karte = s && nachGruppe.get(s.gruppeId);
    if (!s || !t || !s.code || !karte) continue;
    out.geprueft++;
    const oe = karte.get(s.code);
    const hpSr = norm(t.sr), hpZn = norm(t.zn);
    const oeSr = norm(oe?.schiedsrichter ?? null), oeZn = norm(oe?.zeitnehmer ?? null);
    const hp = hpSr || hpZn, oeff = oeSr || oeZn;
    if (!hp && !oeff) out.beideLeer++;
    else if (hpSr === oeSr && hpZn === oeZn) out.gleich++;
    else {
      if (hp && !oeff) out.nurHallenplan++;
      else if (!hp && oeff) out.nurOeffentlich++;
      else out.verschieden++;
      if (out.beispiele.length < 8)
        out.beispiele.push({ termin: `${s.datum} · ${s.code}`, hallenplan: text(t.sr, t.zn), oeffentlich: text(oe?.schiedsrichter ?? null, oe?.zeitnehmer ?? null) });
    }
  }
  return out;
}
