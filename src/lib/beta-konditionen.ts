// Konditionen der Beta-Phase (Stand 07.10.2026) an EINER Stelle: Startseite, Registrierung und Ansprache-Text zeigen dieselben Zahlen.
// Bei Änderung (Ende der Beta, neue Preise) nur hier anpassen.
export const BETA_ENDE = "30.11.2026";
export const PREIS_REGULAER = 300; // € im Jahr
export const PREIS_BETA = 200; // € im Jahr für Vereine, die in der Beta-Phase dabei sind
export const PREIS_SPONSOR = 200; // € im Jahr für den Sponsor-Platz (optional), zusätzlich zur Übernahme des Vereinspreises
export const NETTO = "Alle Preise netto (zzgl. gesetzl. MwSt.).";

export const BETA_KURZ = `Die Beta läuft voraussichtlich bis ${BETA_ENDE}. Wer in der Beta-Phase dabei ist, zahlt danach nur ${PREIS_BETA} € statt ${PREIS_REGULAER} € im Jahr (netto).`;
export const KEIN_RISIKO = "Vor dem Ende der Beta-Phase könnt ihr einfach Bescheid sagen, dass ihr HandballerPate nicht braucht: Dann wird alles gelöscht, und es fallen keine Zahlungen an.";
// Der Sponsor zahlt ALLES: den Vereinspreis (Beta: 200 €) UND den Sponsor-Platz (200 €) — der Verein selbst zahlt dann nichts.
export const SPONSOR_KURZ = `Optional: Ein Sponsor kann beim Öffnen der Vereinsseite eingeblendet werden („Präsentiert von …“). Er zahlt ${PREIS_SPONSOR} € im Jahr für den Platz und übernimmt zusätzlich den Jahrespreis des Vereins (${PREIS_BETA} €) — der Verein zahlt dann nichts.`;
