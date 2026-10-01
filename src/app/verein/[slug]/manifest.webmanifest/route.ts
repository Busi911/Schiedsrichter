import { holeVerein } from "@/lib/liga-oeffentlich";
import { vereinsManifest } from "@/lib/liga-pwa";

// Web-App-Manifest je Verein: Name, Startseite und Farbe sind die des
// Vereins — wer die Seite installiert, bekommt eine App mit dessen Namen.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return new Response("Not found", { status: 404 });
  return Response.json(vereinsManifest(verein), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
