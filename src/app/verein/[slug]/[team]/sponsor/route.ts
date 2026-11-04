import { holeMannschaften, holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";
import { holeMannschaftSponsor, holeMannschaftSponsorBild } from "@/lib/mannschaft-sponsor";

// Sponsorenbild einer Mannschaft (kleines WebP). Nur, wenn der Sponsor aktuell wirksam ist (aktiv, Bild,
// Zeitraum nicht abgelaufen), sonst 404. Die URL trägt die Version (?v=…) als Cache-Buster.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; team: string }> }) {
  const { slug, team } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return new Response("Not found", { status: 404 });
  const m = (await holeMannschaften(verein.id)).find((x) => x.slug === team);
  const sponsor = m ? await holeMannschaftSponsor(verein.vereinId, m.id) : null;
  const bild = m && sponsor ? await holeMannschaftSponsorBild(verein.vereinId, m.id) : null;
  if (!bild) return new Response("Not found", { status: 404 });
  const cache = (await holeVorschau(verein.vereinId)) ? "private, no-store" : "public, max-age=31536000, immutable";
  return new Response(new Uint8Array(bild), { headers: { "Content-Type": "image/webp", "Cache-Control": cache } });
}
