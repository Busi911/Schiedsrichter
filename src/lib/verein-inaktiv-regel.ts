// Wann ein Verein in Vorbereitung als "inaktiv" gilt (rein, getestet in verein-inaktiv-regel.test.ts). Inaktiv heißt: er hat sich auf die
// Ansprache nicht gemeldet, bekommt keine Vorschau, keinen Abruf und keine weitere Ansprache, bleibt aber mit allen Daten erhalten und
// lässt sich jederzeit reaktivieren (neuer Vorschau-Link).

export const INAKTIV_NACH_TAGEN = 14;
const TAG_MS = 24 * 60 * 60 * 1000;

export type InaktivEingabe = {
  status: "vorbereitung" | "aktiv";
  istDemo: boolean;
  angeschriebenAm: Date | null;
  anspracheGesendetAm: Date | null;
  anspracheEmail: string | null;
  followupGesendetAm: Date | null;
  outreachAbgemeldetAm: Date | null;
  inaktivSeit: Date | null;
  hatGueltigenLink: boolean;
};

export function sollInaktivWerden(v: InaktivEingabe, jetzt: Date): boolean {
  if (v.status !== "vorbereitung" || v.istDemo || v.inaktivSeit || v.hatGueltigenLink) return false;
  // Wer sich ausdrücklich abgemeldet hat: sofort (kein gültiger Link mehr nötig zu warten, aber nie mit laufendem Link).
  if (v.outreachAbgemeldetAm) return true;
  const erstkontakt = v.anspracheGesendetAm ?? v.angeschriebenAm;
  if (!erstkontakt) return false;
  // Bei der Mail-Ansprache zuerst die Erinnerung abwarten (sie bringt einen neuen Link).
  if (v.anspracheEmail && !v.followupGesendetAm) return false;
  return jetzt.getTime() - erstkontakt.getTime() >= INAKTIV_NACH_TAGEN * TAG_MS;
}
