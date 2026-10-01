import { notFound } from "next/navigation";
import { holeMannschaften, holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";

// Gemeinsame Daten der drei Bereichsseiten (Ergebnisse, Spiele, Mannschaften).
export async function ladeVereinsDaten(slug: string) {
  const verein = await holeVerein(slug);
  if (!verein) notFound();
  const mannschaften = await holeMannschaften(verein.id);
  // Vorschau per Link: nur ein Ausschnitt (siehe VORSCHAU_MAX).
  const begrenzt = (await holeVorschau(verein.id))?.art === "link";
  return { verein, mannschaften, begrenzt, basis: `/verein/${verein.slug}` };
}
