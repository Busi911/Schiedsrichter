import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { zuschuesse } from "@/db/schema";
import { holeZuschuesse, zuschuesseAlsCsv } from "@/lib/zuschuss";

export async function GET() {
  const session = await auth();
  if (!session?.user?.vereinId || !session.user.istAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }
  const vereinId = session.user.vereinId;

  const alle = await holeZuschuesse(vereinId);
  const offene = alle.filter((z) => z.status === "offen");

  if (offene.length > 0) {
    await withTenant(vereinId, async (tx) => {
      for (const z of offene) {
        await tx
          .update(zuschuesse)
          .set({ status: "exportiert" })
          .where(eq(zuschuesse.id, z.id));
      }
    });
  }

  const csv = zuschuesseAlsCsv(offene);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zuschuesse.csv"',
    },
  });
}
