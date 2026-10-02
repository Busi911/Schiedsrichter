import { requireSystemAdmin } from "@/lib/session";
import { holeSponsorBild } from "@/lib/sponsor";

// Vorschau des gespeicherten Sponsorenbilds für den Systemadmin (auch wenn der Sponsor noch nicht wirksam ist).
export async function GET(_: Request, { params }: { params: Promise<{ vereinId: string }> }) {
  await requireSystemAdmin();
  const { vereinId } = await params;
  const png = await holeSponsorBild(vereinId);
  if (!png) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}
