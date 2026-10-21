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

// Ergebnistext eines Laufs, gemeinsam für den Einzel-Lauf (Redirect) und den Schritt der Auto-Schleife (JSON).
function ergebnisText(ergebnisse: Awaited<ReturnType<typeof synchronisiereFaellige>>["ergebnisse"]): string {
  return ergebnisse
    .map((e) => `${e.slug}: ${[e.struktur && `Struktur ${e.struktur}`, e.spiele && `Spiele ${e.spiele}`, e.handballNet && `handball.net ${e.handballNet}${e.handballNetMeldungen?.length ? ` (${e.handballNetMeldungen.slice(0, 3).join("; ")})` : ""}`].filter(Boolean).join(", ") || "nichts fällig"}`)
    .join(" | ");
}

// Löst den Vereins-Slug auf (wirft bei unbekanntem Slug) — gemeinsam für beide Actions unten.
async function nurVereinIdAusSlug(slug: string): Promise<string | undefined> {
  if (!slug) return undefined;
  const v = await adminDb.query.ligaVereine.findFirst({ where: (t, { eq }) => eq(t.slug, slug) });
  if (!v) throw new Error(`Verein "${slug}" nicht gefunden`);
  return v.id;
}

// Ein Lauf mit Watchdog (teilt sich `ligaSyncJetztAusfuehren` und `ligaSyncSchritt`): "haengt" heißt, er läuft über
// den Watchdog hinaus im Hintergrund weiter (kein Ergebnis mehr rechtzeitig für diese Antwort).
async function laufMitWatchdog(nurVereinId: string | undefined, erzwingen: boolean) {
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
  try {
    return await Promise.race([lauf, watchdog]);
  } finally {
    clearTimeout(timer);
  }
}

// Dieselbe Logik wie der Cron /api/cron/liga-sync (entscheidet je Verein selbst, was fällig ist), nur von Hand
// und ohne CRON_SECRET: für Tests durch den Systemadmin. Optional nur ein Verein (nuLiga-Vereins-Slug); mit "erzwingen" gelten weder Intervall noch 30-Minuten-Sperre.
export async function ligaSyncJetztAusfuehren(formData: FormData) {
  await requireSystemAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const erzwingen = formData.get("erzwingen") === "on";
  const start = Date.now();
  let nurVereinId: string | undefined;
  try {
    nurVereinId = await nurVereinIdAusSlug(slug);
  } catch (err) {
    redirect(`/system/sync?fehler=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  let lauferg: Awaited<ReturnType<typeof laufMitWatchdog>>;
  try {
    lauferg = await laufMitWatchdog(nurVereinId, erzwingen);
  } catch (err) {
    redirect(`/system/sync?fehler=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  if (lauferg === "haengt") {
    redirect(
      `/system/sync?ok=${encodeURIComponent("Läuft im Hintergrund weiter (über 268 s) — Ergebnis bitte in ein paar Minuten direkt beim Verein prüfen.")}`
    );
  }
  const { ergebnisse, vollstaendig } = lauferg;
  const hinweis = vollstaendig ? "" : " — Budget ausgegangen, es sind noch Vereine offen (weitere Läufe holen sie nach).";
  redirect(
    `/system/sync?ok=${encodeURIComponent(`${ergebnisse.length} Verein(e), ${Math.round((Date.now() - start) / 1000)} s — ${ergebnisText(ergebnisse)}${hinweis}`.slice(0, 1500))}`
  );
}

// Ein einzelner Schritt für die Auto-Schleife unten auf der Seite: wie `ligaSyncJetztAusfuehren`, aber ohne
// Redirect — der Client ruft sie wiederholt auf, bis `vollstaendig` true ist oder ein Fehler kommt.
export type SyncSchrittErgebnis = {
  anzahl: number;
  text: string;
  vollstaendig: boolean;
  dauerSekunden: number;
  haengt: boolean;
};

export async function ligaSyncSchritt(input: { slug: string; erzwingen: boolean }): Promise<SyncSchrittErgebnis> {
  await requireSystemAdmin();
  const start = Date.now();
  const nurVereinId = await nurVereinIdAusSlug(input.slug.trim());
  const lauferg = await laufMitWatchdog(nurVereinId, input.erzwingen);
  const dauerSekunden = Math.round((Date.now() - start) / 1000);
  if (lauferg === "haengt") {
    return { anzahl: 0, text: "", vollstaendig: false, dauerSekunden, haengt: true };
  }
  return {
    anzahl: lauferg.ergebnisse.length,
    text: ergebnisText(lauferg.ergebnisse),
    vollstaendig: lauferg.vollstaendig,
    dauerSekunden,
    haengt: false,
  };
}
