// Reine Rechnung (ohne DB, siehe quellen-konflikte.test.ts): findet Mannschaften eines Vereins, die in derselben Saison sowohl über nuLiga als auch über
// handball.net laufen, aber als ZWEI verschiedene Mannschaften geführt werden — mögliche Dubletten, die der Sync nicht von selbst auflöst.

export type QuellenZeile = {
  ligaVereinId: string;
  vereinName: string;
  mannschaftId: string;
  schluessel: string;
  mannschaftName: string;
  kategorie: string;
  geschlecht: string | null;
  altersklasse: string | null;
  nummer: number;
  saison: string;
  quelle: string;
  ligaName: string;
};

export type QuellenKonflikt = {
  vereinName: string;
  saison: string;
  nuliga: { mannschaftName: string; ligaName: string };
  handballNet: { mannschaftName: string; ligaName: string };
  // true: der handball.net-Sync hat die Kollision selbst erkannt und die Mannschaft getrennt geführt (Schlüssel "…:dhb", Name "… (DHB)").
  vomSyncGetrennt: boolean;
};

const DHB_ENDUNG = ":dhb";

function artKey(z: QuellenZeile) {
  return [z.ligaVereinId, z.saison, z.kategorie, z.geschlecht ?? "", z.altersklasse ?? "", z.nummer].join("|");
}

export function findeQuellenKonflikte(zeilen: QuellenZeile[]): QuellenKonflikt[] {
  const gruppen = new Map<string, QuellenZeile[]>();
  for (const z of zeilen) {
    if (z.quelle !== "nuliga" && z.quelle !== "handball_net") continue;
    const key = artKey(z);
    gruppen.set(key, [...(gruppen.get(key) ?? []), z]);
  }
  const ergebnis: QuellenKonflikt[] = [];
  for (const liste of gruppen.values()) {
    const nuliga = liste.filter((z) => z.quelle === "nuliga");
    const hnet = liste.filter((z) => z.quelle === "handball_net");
    for (const n of nuliga) {
      for (const h of hnet) {
        if (n.mannschaftId === h.mannschaftId) continue; // dieselbe Mannschaft in beiden Quellen: kein Konflikt
        ergebnis.push({
          vereinName: n.vereinName,
          saison: n.saison,
          nuliga: { mannschaftName: n.mannschaftName, ligaName: n.ligaName },
          handballNet: { mannschaftName: h.mannschaftName, ligaName: h.ligaName },
          vomSyncGetrennt: h.schluessel === n.schluessel + DHB_ENDUNG,
        });
      }
    }
  }
  return ergebnis.sort((a, b) => a.vereinName.localeCompare(b.vereinName, "de") || a.nuliga.mannschaftName.localeCompare(b.nuliga.mannschaftName, "de"));
}
