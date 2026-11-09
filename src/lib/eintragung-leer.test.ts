import { describe, expect, it } from "vitest";
import { leerErklaerung } from "./eintragung-leer";

describe("leerErklaerung", () => {
  it("Spiele vorhanden, aber überall Bedarf 0: verständlicher Satz, Admin bekommt den Weg zur Einstellung", () => {
    const e = leerErklaerung({ anstehende: 12, mitBedarf: 0, gefiltert: false });
    expect(e.text).toBe("Aktuell sind keine Dienste zur Eintragung freigegeben.");
    expect(e.fuerAdmin?.text).toContain("12 anstehenden Termine");
    expect(e.fuerAdmin?.href).toBe("/admin/einstellungen#dienste-bedarf");
  });
  it("ein einzelner Termin wird in der Einzahl genannt", () => {
    expect(leerErklaerung({ anstehende: 1, mitBedarf: 0, gefiltert: false }).fuerAdmin?.text).toContain("1 anstehenden Termin ");
  });
  it("gar keine Termine: das wird gesagt, Admin verweist auf Termine", () => {
    const e = leerErklaerung({ anstehende: 0, mitBedarf: 0, gefiltert: false });
    expect(e.text).toContain("keine anstehenden Spiele oder Termine");
    expect(e.fuerAdmin?.href).toBe("/admin/termine");
  });
  it("Mannschaftsfilter ohne Treffer, andere Mannschaften haben Bedarf: Hinweis auf den Filter", () => {
    const e = leerErklaerung({ anstehende: 12, mitBedarf: 5, gefiltert: true });
    expect(e.text).toContain("Für diese Mannschaft");
    expect(e.fuerAdmin).toBeUndefined();
  });
});
