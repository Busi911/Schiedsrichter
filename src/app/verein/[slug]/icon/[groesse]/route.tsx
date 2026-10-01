import { ImageResponse } from "next/og";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { vereinsFarbton, vereinsInitialen } from "@/lib/liga-pwa";

// App-Icon je Verein (Initialen auf vereinsspezifischer Farbe) — wir haben
// keine Vereinslogos, daher wird das Icon dynamisch erzeugt.
const ERLAUBT = new Set(["180", "192", "512"]);

export async function GET(_: Request, { params }: { params: Promise<{ slug: string; groesse: string }> }) {
  const { slug, groesse } = await params;
  if (!ERLAUBT.has(groesse)) return new Response("Not found", { status: 404 });
  const verein = await holeVerein(slug);
  if (!verein) return new Response("Not found", { status: 404 });

  const px = Number(groesse);
  const h = vereinsFarbton(verein.slug);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, hsl(${h} 60% 38%), hsl(${(h + 30) % 360} 65% 22%))`,
          color: "white",
          fontSize: px * 0.42,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        {vereinsInitialen(verein.name)}
      </div>
    ),
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
