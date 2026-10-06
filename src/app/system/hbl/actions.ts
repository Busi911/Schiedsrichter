"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten, ligaGruppen, ligaSpiele, ligaTeilnahmen } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { verknuepfeHblTeam } from "@/lib/sources/identitaet";
import { synchronisiereHblLigen } from "@/lib/sources/hbl/lauf";
import type { HblWettbewerb } from "@/lib/sources/match";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meldung = (art: "ok" | "fehler", text: string) => `/system/hbl?${art}=${encodeURIComponent(text.slice(0, 1500))}`;

// Von Hand laden (auch ohne Zuordnung, damit die Teams zum Zuordnen erscheinen). Dauert bis ca. 50 s.
export async function hblJetztLaden(formData: FormData) {
  await requireSystemAdmin();
  const liga = formData.get("liga");
  const ligen: HblWettbewerb[] = liga === "hbl1" || liga === "hbl2" ? [liga] : ["hbl1", "hbl2"];
  const ergebnisse = await synchronisiereHblLigen({ erzwingen: true, mitTeams: formData.get("teams") === "1", ligen });
  revalidatePath("/system/hbl");
  redirect(meldung("ok", ergebnisse.map((e) => e.text).join(" | ")));
}

export async function hblTeamZuordnen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "").toLowerCase();
  const ligaVereinId = String(formData.get("ligaVereinId") ?? "");
  const name = String(formData.get("name") ?? "").slice(0, 200);
  if (!UUID.test(teamId) || !UUID.test(ligaVereinId)) redirect(meldung("fehler", "Team oder Verein fehlt."));
  const r = await verknuepfeHblTeam(adminDb, ligaVereinId, { externalId: teamId, name });
  revalidatePath("/system/hbl");
  redirect(r.ok ? meldung("ok", "Zugeordnet. Mannschaft und Spiele kommen beim nächsten Lauf (alle 15 Min.) oder über „Jetzt laden“.") : meldung("fehler", r.grund));
}

// Löst die Zuordnung: Identität weg, Teilnahme inaktiv, die HBL-Spiele dieses Teams werden entfernt (kommen bei erneuter Zuordnung wieder).
export async function hblTeamLoesen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "").toLowerCase();
  if (!UUID.test(teamId)) redirect(meldung("fehler", "Team fehlt."));
  const gruppen = await adminDb.select({ id: ligaGruppen.id }).from(ligaGruppen).where(eq(ligaGruppen.quelle, "hbl"));
  const ids = gruppen.map((g) => g.id);
  if (ids.length > 0) {
    await adminDb.update(ligaTeilnahmen).set({ aktiv: false }).where(and(inArray(ligaTeilnahmen.gruppeId, ids), eq(ligaTeilnahmen.nuligaTeamtableId, teamId)));
    await adminDb
      .delete(ligaSpiele)
      .where(and(inArray(ligaSpiele.gruppeId, ids), eq(ligaSpiele.quelle, "hbl"), or(eq(ligaSpiele.heimTeamtableId, teamId), eq(ligaSpiele.gastTeamtableId, teamId))));
  }
  await adminDb.delete(ligaExterneIdentitaeten).where(and(eq(ligaExterneIdentitaeten.quelle, "hbl"), eq(ligaExterneIdentitaeten.externeId, teamId)));
  revalidatePath("/system/hbl");
  redirect(meldung("ok", "Zuordnung gelöst."));
}
