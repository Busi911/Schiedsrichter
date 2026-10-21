"use server";

import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { synchronisiereFaellige } from "@/lib/nuliga/sync-cron";
import { requireSystemAdmin } from "@/lib/session";

// Spätestens nach dieser Zeit antwortet die Action selbst, bevor Vercel den Lauf nach maxDuration (page.tsx)
// hart abbricht (504 ohne Ergebnis) — wie beim Cron (siehe liga-sync/route.ts).
const WATCHDOG_MS = 268_000;

// Dieselbe Logik wie der Cron /api/cron/liga-sync (entscheidet je Verein selbst, was fällig ist), nur von Hand
// und ohne CRON_SECRET: für Tests durch den Systemadmin. Optional nur ein Verein (nuLiga-Vereins-Slug); mit "erzwingen" gelten weder Intervall noch 30-Minuten-Sperre.
export async function ligaSyncJetztAusfuehren(formData: FormData) {
  await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  let nurVereinId: string | undefined;
  if (slug) {
    const v = await adminDb.query.ligaVereine.findFirst({ where: (t, { eq }) => eq(t.slug, slug) });
    if (!v) redirect(`/system/sync?fehler=${encodeURIComponent(`Verein "${slug}" nicht gefunden`)}`);
    nurVereinId = v.id;
  }
  const erzwingen = formData.get("erzwingen") === "on";
  const start = Date.now();
  const lauf = synchronisiereFaellige({
    db: adminDb,
    holeHtml: holeNuligaHtml,
    holeJson: holeHandballNetApi,
    budgetMs: 255_000,
    nurVereinId,
    erzwingen,
  });
  // Ein Fehler nach dem Watchdog soll nicht als unbehandelte Ablehnung enden.
  lauf.catch((err) => console.error("[sync/jetzt-ausfuehren] Fehler nach dem Watchdog:", err));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<"haengt">((resolve) => {
    timer = setTimeout(() => resolve("haengt"), WATCHDOG_MS);
  });
  let ergebnis: Awaited<ReturnType<typeof synchronisiereFaellige>> | "haengt";
  try {
    ergebnis = await Promise.race([lauf, watchdog]);
  } catch (err) {
    clearTimeout(timer);
    redirect(`/system/sync?fehler=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  clearTimeout(timer);
  if (ergebnis === "haengt") {
    redirect(
      `/system/sync?ok=${encodeURIComponent("Läuft im Hintergrund weiter (über 268 s) — Ergebnis bitte in ein paar Minuten direkt beim Verein prüfen.")}`
    );
  }
  const text = ergebnis
    .map((e) => `${e.slug}: ${[e.struktur && `Struktur ${e.struktur}`, e.spiele && `Spiele ${e.spiele}`, e.handballNet && `handball.net ${e.handballNet}${e.handballNetMeldungen?.length ? ` (${e.handballNetMeldungen.slice(0, 3).join("; ")})` : ""}`].filter(Boolean).join(", ") || "nichts fällig"}`)
    .join(" | ");
  redirect(`/system/sync?ok=${encodeURIComponent(`${ergebnis.length} Verein(e), ${Math.round((Date.now() - start) / 1000)} s — ${text}`.slice(0, 1500))}`);
}
