"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten, ligaGruppen, ligaSpiele, ligaTeilnahmen } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { verknuepfeExternesTeam } from "@/lib/sources/identitaet";
import { NDR_LIGA_LISTE, synchronisiereNdrLiga } from "@/lib/sources/ndr/lauf";
import type { BundesLiga } from "@/lib/sources/match";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM_ID = /^name:[a-z0-9-]{1,120}$/;
const meldung = (art: "ok" | "fehler", text: string) => `/system/ndr?${art}=${encodeURIComponent(text.slice(0, 1500))}`;

// Von Hand laden (auch ohne Zuordnung: dann nur die Tabellenseite, damit die Teams zum Zuordnen erscheinen; mit Zuordnung der normale Lauf).
// "Alle Spieltage neu" holt alle Spieltage (dauert, wird bei Zeitnot beim nächsten Lauf fortgesetzt). Bis ca. 50 s.
export async function ndrJetztLaden(formData: FormData) {
  await requireSystemAdmin();
  const liga = formData.get("liga");
  const ligen: BundesLiga[] = liga === "hbl1" || liga === "hbl2" ? [liga] : NDR_LIGA_LISTE;
  const voll = formData.get("voll") === "1";
  const texte: string[] = [];
  const ende = Date.now() + 48_000;
  for (const l of ligen) {
    const r = await synchronisiereNdrLiga(l, { erzwingen: true, voll, frist: ende });
    texte.push(r.text);
  }
  revalidatePath("/system/ndr");
  redirect(meldung("ok", texte.join(" | ")));
}

export async function ndrTeamZuordnen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  const ligaVereinId = String(formData.get("ligaVereinId") ?? "");
  const name = String(formData.get("name") ?? "").slice(0, 200);
  if (!TEAM_ID.test(teamId) || !UUID.test(ligaVereinId)) redirect(meldung("fehler", "Team oder Verein fehlt."));
  const r = await verknuepfeExternesTeam(adminDb, "ndr", ligaVereinId, { externalId: teamId, name });
  revalidatePath("/system/ndr");
  redirect(r.ok ? meldung("ok", "Zugeordnet. Mannschaft und Spiele kommen beim nächsten Lauf (alle 15 Min.) oder über „Jetzt laden“. Der Erstimport holt alle Spieltage nach und nach.") : meldung("fehler", r.grund));
}

// Löst die Zuordnung: Identität weg, Teilnahme inaktiv, die ndr.de-Spiele dieses Teams werden entfernt (kommen bei erneuter Zuordnung wieder).
export async function ndrTeamLoesen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  if (!TEAM_ID.test(teamId)) redirect(meldung("fehler", "Team fehlt."));
  const gruppen = await adminDb.select({ id: ligaGruppen.id }).from(ligaGruppen).where(eq(ligaGruppen.quelle, "ndr"));
  const ids = gruppen.map((g) => g.id);
  if (ids.length > 0) {
    await adminDb.update(ligaTeilnahmen).set({ aktiv: false }).where(and(inArray(ligaTeilnahmen.gruppeId, ids), eq(ligaTeilnahmen.nuligaTeamtableId, teamId)));
    await adminDb
      .delete(ligaSpiele)
      .where(and(inArray(ligaSpiele.gruppeId, ids), eq(ligaSpiele.quelle, "ndr"), or(eq(ligaSpiele.heimTeamtableId, teamId), eq(ligaSpiele.gastTeamtableId, teamId))));
  }
  await adminDb.delete(ligaExterneIdentitaeten).where(and(eq(ligaExterneIdentitaeten.quelle, "ndr"), eq(ligaExterneIdentitaeten.externeId, teamId)));
  revalidatePath("/system/ndr");
  redirect(meldung("ok", "Zuordnung gelöst."));
}
