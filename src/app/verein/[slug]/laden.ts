import { notFound } from "next/navigation";
import { holeMannschaften, holeVerein } from "@/lib/liga-oeffentlich";

// Gemeinsame Daten der drei Bereichsseiten (Ergebnisse, Spiele, Mannschaften).
export async function ladeVereinsDaten(slug: string) {
  const verein = await holeVerein(slug);
  if (!verein) notFound();
  const mannschaften = await holeMannschaften(verein.id);
  return { verein, mannschaften, basis: `/verein/${verein.slug}` };
}
