import { auth } from "@/auth";
import { holeTermineFuerAuswertung } from "@/lib/termin-auswertung";
import { terminAlsPdf } from "@/lib/termin-pdf";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.vereinId || !session.user.istAdmin) {
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
  const pdf = await terminAlsPdf(termine);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="termine.pdf"',
    },
  });
}
