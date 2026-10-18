import { holeKontextSession } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import { saisonLabel } from "@/lib/saison";
import { ladeMitglieder, ladeMitgliedsarten, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { ladeVereinsMannschaften, ladeZuordnungen } from "@/lib/mitglied-mannschaften-daten";
import { baueExportZeilen, waehleMitglieder } from "@/lib/mitglieder-auswahl";
import { mitgliederAlsExcel, mitgliederVorlage } from "@/lib/mitglieder-excel";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel-Export der Mitglieder (mit denselben Filtern wie die Liste) bzw. leere Vorlage für den Import (?vorlage=1). Nur Vereinsadmins, nur mit Add-on.
export async function GET(request: Request) {
  const session = await holeKontextSession();
  if (!session?.user?.vereinId || (!session.user.istAdmin && !session.user.istAdminLesend)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const vereinId = session.user.vereinId;
  if (!(await vereinsverwaltungAktiv(vereinId))) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const antwort = (daten: Buffer, dateiname: string) =>
    new Response(new Uint8Array(daten), {
      headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${dateiname}"`, "Cache-Control": "private, no-store" },
    });

  if (url.searchParams.get("vorlage")) return antwort(await mitgliederVorlage(), "mitglieder-vorlage.xlsx");

  const saison = saisonLabel(new Date());
  const [alle, arten, zuordnungen, mannschaften] = await Promise.all([
    ladeMitglieder(vereinId),
    ladeMitgliedsarten(vereinId),
    ladeZuordnungen(vereinId),
    ladeVereinsMannschaften(vereinId),
  ]);
  const auswahl = waehleMitglieder(alle, zuordnungen, {
    q: url.searchParams.get("q") ?? "",
    status: url.searchParams.get("status") ?? "",
    art: url.searchParams.get("art") ?? "",
    mannschaft: url.searchParams.get("mannschaft") ?? "",
    saison,
  });
  const excel = await mitgliederAlsExcel(baueExportZeilen(auswahl, arten, zuordnungen, mannschaften, saison));
  // Personendaten verlassen die App: im Vereinsprotokoll festhalten.
  await schreibeProtokoll(vereinId, "mitglieder_export", session.user.email ?? "Admin", `${auswahl.length} Mitglieder als Excel exportiert`).catch(() => undefined);
  return antwort(excel, "mitglieder.xlsx");
}
