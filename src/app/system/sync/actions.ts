"use server";

import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { synchronisiereFaellige } from "@/lib/nuliga/sync-cron";
import { requireSystemAdmin } from "@/lib/session";

// Dieselbe Logik wie der Cron /api/cron/liga-sync (entscheidet je Verein selbst, was fällig ist), nur von Hand
// und ohne CRON_SECRET: für Tests durch den Systemadmin. Optional nur ein Verein (nuLiga-Vereins-Slug).
export async function ligaSyncJetztAusfuehren(formData: FormData) {
  await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  let nurVereinId: string | undefined;
  if (slug) {
    const v = await adminDb.query.ligaVereine.findFirst({ where: (t, { eq }) => eq(t.slug, slug) });
    if (!v) redirect(`/system/sync?fehler=${encodeURIComponent(`Verein "${slug}" nicht gefunden`)}`);
    nurVereinId = v.id;
  }
  const start = Date.now();
  let ergebnis: Awaited<ReturnType<typeof synchronisiereFaellige>>;
  try {
    ergebnis = await synchronisiereFaellige({
      db: adminDb,
      holeHtml: holeNuligaHtml,
      holeJson: holeHandballNetApi,
      budgetMs: 40_000,
      nurVereinId,
    });
  } catch (err) {
    redirect(`/system/sync?fehler=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  const text = ergebnis
    .map((e) => `${e.slug}: ${[e.struktur && `Struktur ${e.struktur}`, e.spiele && `Spiele ${e.spiele}`, e.handballNet && `handball.net ${e.handballNet}`].filter(Boolean).join(", ") || "nichts fällig"}`)
    .join(" | ");
  redirect(`/system/sync?ok=${encodeURIComponent(`${ergebnis.length} Verein(e), ${Math.round((Date.now() - start) / 1000)} s — ${text}`.slice(0, 1500))}`);
}
