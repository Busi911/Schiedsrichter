import { auth } from "@/auth";
import { holeTermineFuerAuswertung } from "@/lib/termin-auswertung";
import { terminAlsExcel } from "@/lib/termin-excel";

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
  const excel = await terminAlsExcel(termine);

  return new Response(new Uint8Array(excel), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="dienstplan.xlsx"',
    },
  });
}
