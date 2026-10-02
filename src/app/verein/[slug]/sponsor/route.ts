import { holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";
import { holeSponsor, holeSponsorBild } from "@/lib/sponsor";

// Das Sponsorenbild des Vereins (normalisiertes PNG). Nur, wenn der Sponsor aktuell wirksam ist (aktiv,
// Vertragszeitraum nicht abgelaufen). Die URL trägt die Version (?v=…) als Cache-Buster.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  const sponsor = verein ? await holeSponsor(verein.vereinId) : null;
  const png = sponsor && verein ? await holeSponsorBild(verein.vereinId) : null;
  if (!png) return new Response("Not found", { status: 404 });
  const cache = (await holeVorschau(verein!.vereinId)) ? "private, no-store" : "public, max-age=3600";
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": cache },
  });
}
