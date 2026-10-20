import { holeKontextSession } from "@/lib/session";
import { holeFunktionstraegerDienste } from "@/lib/dienste-statistik";
import { funktionstraegerDiensteAlsExcel } from "@/lib/funktionstraeger-dienste-excel";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel-Export der Tabelle "Dienste je Funktionsträger" (?saison=2026/27, sonst alle Saisons). Nur Vereinsadmins (auch lesende).
export async function GET(request: Request) {
  const session = await holeKontextSession();
  if (!session?.user?.vereinId || (!session.user.istAdmin && !session.user.istAdminLesend)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const saisonParam = new URL(request.url).searchParams.get("saison");
  const { saison, personen } = await holeFunktionstraegerDienste(session.user.vereinId, saisonParam);
  const excel = await funktionstraegerDiensteAlsExcel(personen, saison);
  const dateiname = `dienste-funktionstraeger-${saison ? saison.replace("/", "-") : "alle-saisons"}.xlsx`;
  return new Response(new Uint8Array(excel), {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${dateiname}"`, "Cache-Control": "private, no-store" },
  });
}
