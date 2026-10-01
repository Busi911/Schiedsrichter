import { attribut, normalisiereSpaltenkopf, tabellen, textVon, zeilen, zellen } from "../html";

// Angesetzter Schiedsrichter je Spiel (nur Kürzel, z.B. "Must.") aus der Ergebnis-Spalte
// noch nicht gespielter Spiele (<span title="Nachname Vorname">Kürzel</span>).
//
// DATENSCHUTZ: bewusst GETRENNT von parseSpielTabellen/NuligaSpiel (der Whitelist für die
// öffentlichen liga_*-Tabellen). Das Ergebnis darf nur transient verwendet bzw. in den
// PRIVATEN Termin eines Vereins geschrieben werden (termin.nuliga_schiedsrichter_kuerzel),
// nie in liga_*. Es wird nur das Kürzel gelesen, nicht der volle Name aus title.
export type NuligaAnsetzung = { spielnummer: number; kuerzel: string };

export function parseAnsetzungen(html: string): NuligaAnsetzung[] {
  const ergebnis: NuligaAnsetzung[] = [];
  for (const tabelle of tabellen(html)) {
    const alle = zeilen(tabelle);
    const kopfZeile = alle.find((z) => /<th\b/i.test(z));
    if (!kopfZeile) continue;
    const kopf = zellen(kopfZeile).map((z) => normalisiereSpaltenkopf(z.text));
    const nr = kopf.indexOf("nr.");
    const gast = kopf.indexOf("gastmannschaft");
    if (nr < 0 || gast < 0) continue;
    for (const zeile of alle) {
      if (/<th\b/i.test(zeile)) continue;
      const z = zellen(zeile);
      const nummer = z[nr]?.text.match(/^\d+$/)?.[0];
      const zelle = z[gast + 1];
      if (!nummer || !zelle || /MeetingReport/i.test(zelle.html)) continue;
      const span = zelle.html.match(/<span\b([^>]*)>([\s\S]*?)<\/span>/i);
      if (!span || !attribut(`<span ${span[1]}>`, "title")) continue;
      const kuerzel = textVon(span[2]).trim();
      if (kuerzel) ergebnis.push({ spielnummer: Number(nummer), kuerzel });
    }
  }
  return ergebnis;
}
