import "server-only";
import ExcelJS from "exceljs";
import { DIENST_ROLLEN, DIENST_ROLLE_LABEL, type FunktionstraegerDienste } from "@/lib/funktionstraeger-dienste";
import { zelleSicher } from "@/lib/mitglieder-import";

/** Excel zur Tabelle "Dienste je Funktionsträger": je Person Summen, dazu je Rolle zwei Spalten (geleistet/eingetragen). */
export async function funktionstraegerDiensteAlsExcel(personen: FunktionstraegerDienste[], saison: string | null): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dienste");
  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "E-Mail", key: "email", width: 30 },
    { header: "Geleistet", key: "geleistet", width: 11 },
    { header: "Eingetragen", key: "eingetragen", width: 13 },
    ...DIENST_ROLLEN.flatMap((r) => [
      { header: `${DIENST_ROLLE_LABEL[r]} geleistet`, key: `${r}_g`, width: 16 },
      { header: `${DIENST_ROLLE_LABEL[r]} eingetragen`, key: `${r}_e`, width: 18 },
    ]),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const p of personen) {
    const zeile: Record<string, string | number> = {
      name: zelleSicher(p.name ?? p.email),
      email: zelleSicher(p.email),
      geleistet: p.geleistet,
      eingetragen: p.eingetragen,
    };
    for (const r of DIENST_ROLLEN) {
      zeile[`${r}_g`] = p.nachRolle[r]?.geleistet ?? 0;
      zeile[`${r}_e`] = p.nachRolle[r]?.eingetragen ?? 0;
    }
    sheet.addRow(zeile);
  }
  workbook.addWorksheet("Hinweise").addRow([
    `Saison: ${saison ?? "alle Saisons"}. Geleistet = Termin vorbei, eingetragen = Termin liegt noch vor uns.`,
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
