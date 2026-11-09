// Woher eine interne Mannschaft stammt (Liga/Wettbewerb, Saison, Datenquelle) und welche Mannschaften gleich bezeichnet sind (rein/getestet).
// Testbericht 09.11.2026: zwei Mannschaften hießen beide „HSG Dutenh./Münchholzh.“ + „MJE“, anhand der Oberfläche war nicht erkennbar, ob es
// verschiedene Wettbewerbe oder doppelte Datensätze sind. Es wird NICHTS automatisch zusammengeführt: das hier macht den Unterschied nur sichtbar.

export type MannschaftHerkunft = {
  liga: string | null;
  saison: string | null;
  quelle: string | null; // "nuliga" | "handball_net" | "ndr" | null (keine Verknüpfung mit Liga-Daten)
};

const QUELLE_LABEL: Record<string, string> = { nuliga: "nuLiga", handball_net: "handball.net", ndr: "NDR" };

export function quelleLabel(quelle: string | null | undefined): string | null {
  if (!quelle) return null;
  return QUELLE_LABEL[quelle] ?? quelle;
}

/** „Kreisliga A · Saison 2026/27 · nuLiga“; ohne Verknüpfung zu Liga-Daten „von Hand angelegt (keine Liga verknüpft)“. */
export function herkunftText(h: MannschaftHerkunft | undefined | null): string {
  if (!h || (!h.liga && !h.saison && !h.quelle)) return "von Hand angelegt (keine Liga verknüpft)";
  return [h.liga, h.saison ? `Saison ${h.saison}` : null, quelleLabel(h.quelle)].filter(Boolean).join(" · ");
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("de-DE");

/** IDs aller Mannschaften, deren Name UND Altersklasse mit mindestens einer anderen übereinstimmen. */
export function findeGleichBezeichnete(liste: { id: string; name: string; altersklasse: string | null }[]): Set<string> {
  const gruppen = new Map<string, string[]>();
  for (const m of liste) {
    const schluessel = `${norm(m.name)}|${norm(m.altersklasse)}`;
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), m.id]);
  }
  return new Set([...gruppen.values()].filter((ids) => ids.length > 1).flat());
}

/**
 * Anzeigename, der gleich bezeichnete Mannschaften unterscheidbar macht (z.B. im Trainingsplan): „Name (Altersklasse) – Liga“.
 * Nur bei Gleichbezeichnung und bekannter Liga ergänzt, sonst unverändert.
 */
export function unterscheidbarerName(
  m: { name: string; altersklasse: string | null },
  gleichBezeichnet: boolean,
  herkunft: MannschaftHerkunft | undefined
): string {
  const basis = m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name;
  if (!gleichBezeichnet) return basis;
  const zusatz = herkunft?.liga ?? (herkunft ? quelleLabel(herkunft.quelle) : null);
  return zusatz ? `${basis} – ${zusatz}` : basis;
}
