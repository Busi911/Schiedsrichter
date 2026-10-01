import { cache } from "react";
import { notFound } from "next/navigation";
import { holeMannschaften, holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";

// Gemeinsamer Loader aller Mannschafts-Unterseiten (per cache() je Request
// nur einmal ausgeführt, auch wenn Layout und Seite ihn beide aufrufen).
export const ladeTeam = cache(async (slug: string, teamSlug: string) => {
  const verein = await holeVerein(slug);
  if (!verein) notFound();
  const mannschaften = await holeMannschaften(verein.id);
  const m = mannschaften.find((x) => x.slug === teamSlug);
  if (!m) notFound();
  const begrenzt = (await holeVorschau(verein.id))?.art === "link";
  return { verein, m, begrenzt };
});
