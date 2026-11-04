import { appUrl } from "@/lib/app-url";
import { holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";
import { holeOeffentlicheNeuigkeiten } from "@/lib/neuigkeiten-daten";
import { baueRssFeed } from "@/lib/neuigkeiten";

// RSS-Feed der Neuigkeiten eines Vereins (für die Homepage des Vereins). Nur, wenn der Verein die Neuigkeiten eingeschaltet hat,
// sonst 404. Enthält nur Titel, Kurztext, Datum und Link der VERÖFFENTLICHTEN Meldungen; keine Entwürfe, keine Personen.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  const liste = verein ? await holeOeffentlicheNeuigkeiten(verein.vereinId, 20) : null;
  if (!verein || !liste) return new Response("Not found", { status: 404 });
  const basis = `${appUrl()}/verein/${verein.slug}`;
  const xml = baueRssFeed({
    vereinName: verein.name,
    seitenUrl: `${basis}/neuigkeiten`,
    feedUrl: `${basis}/feed.xml`,
    eintraege: liste.map((n) => ({ id: n.id, titel: n.titel, text: n.text, datum: n.datum, link: `${basis}/neuigkeiten#${n.id}` })),
  });
  const vorschau = await holeVorschau(verein.vereinId);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": vorschau ? "private, no-store" : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
