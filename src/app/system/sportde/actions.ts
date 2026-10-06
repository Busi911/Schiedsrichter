"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten, ligaGruppen, ligaSpiele, ligaTeilnahmen } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { verknuepfeSportDeTeam } from "@/lib/sources/identitaet";
import { SPORTDE_LIGA_LISTE, synchronisiereSportDeLiga } from "@/lib/sources/sportde/lauf";
import type { SportDeLiga } from "@/lib/sources/match";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const meldung = (art: "ok" | "fehler", text: string) => `/system/sportde?${art}=${encodeURIComponent(text.slice(0, 1500))}`;

// Von Hand laden (auch ohne Zuordnung: dann nur die Tabellenseite, damit die Teams zum Zuordnen erscheinen; mit Zuordnung der normale Lauf).
// "Alle Spieltage neu" holt alle 34 Seiten (dauert, wird bei Zeitnot beim nächsten Lauf fortgesetzt). Bis ca. 50 s.
export async function sportDeJetztLaden(formData: FormData) {
  await requireSystemAdmin();
  const liga = formData.get("liga");
  const ligen: SportDeLiga[] = liga === "hbl1" || liga === "hbl2" ? [liga] : SPORTDE_LIGA_LISTE;
  const voll = formData.get("voll") === "1";
  const texte: string[] = [];
  const ende = Date.now() + 48_000;
  for (const l of ligen) {
    const r = await synchronisiereSportDeLiga(l, { erzwingen: true, voll, frist: ende });
    texte.push(r.text);
  }
  revalidatePath("/system/sportde");
  redirect(meldung("ok", texte.join(" | ")));
}

export async function sportDeTeamZuordnen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "").toLowerCase();
  const ligaVereinId = String(formData.get("ligaVereinId") ?? "");
  const name = String(formData.get("name") ?? "").slice(0, 200);
  if (!UUID.test(teamId) || !UUID.test(ligaVereinId)) redirect(meldung("fehler", "Team oder Verein fehlt."));
  const r = await verknuepfeSportDeTeam(adminDb, ligaVereinId, { externalId: teamId, name });
  revalidatePath("/system/sportde");
  redirect(r.ok ? meldung("ok", "Zugeordnet. Mannschaft und Spiele kommen beim nächsten Lauf (alle 15 Min.) oder über „Jetzt laden“. Der Erstimport holt alle Spieltage nach und nach.") : meldung("fehler", r.grund));
}

// Löst die Zuordnung: Identität weg, Teilnahme inaktiv, die sport.de-Spiele dieses Teams werden entfernt (kommen bei erneuter Zuordnung wieder).
export async function sportDeTeamLoesen(formData: FormData) {
  await requireSystemAdmin();
  const teamId = String(formData.get("teamId") ?? "").toLowerCase();
  if (!UUID.test(teamId)) redirect(meldung("fehler", "Team fehlt."));
  const gruppen = await adminDb.select({ id: ligaGruppen.id }).from(ligaGruppen).where(eq(ligaGruppen.quelle, "sportde"));
  const ids = gruppen.map((g) => g.id);
  if (ids.length > 0) {
    await adminDb.update(ligaTeilnahmen).set({ aktiv: false }).where(and(inArray(ligaTeilnahmen.gruppeId, ids), eq(ligaTeilnahmen.nuligaTeamtableId, teamId)));
    await adminDb
      .delete(ligaSpiele)
      .where(and(inArray(ligaSpiele.gruppeId, ids), eq(ligaSpiele.quelle, "sportde"), or(eq(ligaSpiele.heimTeamtableId, teamId), eq(ligaSpiele.gastTeamtableId, teamId))));
  }
  await adminDb.delete(ligaExterneIdentitaeten).where(and(eq(ligaExterneIdentitaeten.quelle, "sportde"), eq(ligaExterneIdentitaeten.externeId, teamId)));
  revalidatePath("/system/sportde");
  redirect(meldung("ok", "Zuordnung gelöst."));
}
