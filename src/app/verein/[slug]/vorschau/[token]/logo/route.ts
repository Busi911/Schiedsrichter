import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine } from "@/db/schema";
import { holeLogo } from "@/lib/liga-oeffentlich";
import { pruefeVorschauToken } from "@/lib/verein-vorschau";

// Logo für die Link-Vorschau (og:image) eines Vorschau-Links: Crawler haben
// kein Cookie, daher hängt der Zugriff hier am Token selbst.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const [lv] = await adminDb.select({ id: ligaVereine.id, vereinId: ligaVereine.vereinId }).from(ligaVereine).where(eq(ligaVereine.slug, slug));
  const link = await pruefeVorschauToken(token);
  if (!lv || !link || link.vereinId !== lv.vereinId) return new Response("Not found", { status: 404 });
  const logo = await holeLogo(lv.id);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.daten), { headers: { "Content-Type": logo.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
