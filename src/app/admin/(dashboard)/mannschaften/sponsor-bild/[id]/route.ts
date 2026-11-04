import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaftSponsoren } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

// Vorschau des Mannschaftssponsor-Bilds im Admin-Bereich (auch für das Bild, das noch nicht wirksam ist).
// Nur der eigene Verein: withTenant (RLS) plus ausdrücklicher Vereinsfilter. Nie im gemeinsamen Cache.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [z] = await withTenant(vereinId, (tx) =>
    tx
      .select({ bild: mannschaftSponsoren.bild })
      .from(mannschaftSponsoren)
      .where(and(eq(mannschaftSponsoren.vereinId, vereinId), eq(mannschaftSponsoren.ligaMannschaftId, id)))
  );
  if (!z?.bild) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(z.bild), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" },
  });
}
