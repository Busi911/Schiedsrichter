import { auth } from "@/auth";
import { holeTermineFuerAuswertung, terminAlsCsv } from "@/lib/termin-auswertung";

export async function GET(request: Request) {
  const session = await auth();
  if (
    !session?.user?.vereinId ||
    (!session.user.istAdmin && !session.user.istAdminLesend)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const filter = {
    von: url.searchParams.get("von") ?? undefined,
    bis: url.searchParams.get("bis") ?? undefined,
    typ: url.searchParams.get("typ") ?? undefined,
    schiedsrichterId: url.searchParams.get("schiedsrichterId") ?? undefined,
  };

  const termine = await holeTermineFuerAuswertung(session.user.vereinId, filter);
  const csv = terminAlsCsv(termine);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="termine.csv"',
    },
  });
}
