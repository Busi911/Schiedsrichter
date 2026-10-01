import { holeLogoPng, holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";

// Das hochgeladene Vereinslogo (normalisiertes PNG). Die URL trägt die
// Version (?v=…) als Cache-Buster, daher darf lange gecacht werden.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  const png = verein ? await holeLogoPng(verein.id) : null;
  if (!png) return new Response("Not found", { status: 404 });
  // Vorschau-Verein (Zugriff hängt am Cookie): nie im gemeinsamen Cache ablegen.
  const cache = (await holeVorschau(verein!.vereinId)) ? "private, no-store" : "public, max-age=86400";
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": cache },
  });
}
