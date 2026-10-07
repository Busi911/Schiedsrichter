// Konditionen der Beta-Phase (Stand 07.10.2026) an EINER Stelle: Startseite, Registrierung und Ansprache-Text zeigen dieselben Zahlen.
// Bei Änderung (Ende der Beta, neue Preise) nur hier anpassen.
export const BETA_ENDE = "30.11.2026";
export const PREIS_REGULAER = 300; // € im Jahr
export const PREIS_BETA = 200; // € im Jahr für Vereine, die in der Beta-Phase dabei sind
export const PREIS_SPONSOR = 200; // € im Jahr für einen Sponsor (optional)

export const BETA_KURZ = `Die Beta läuft voraussichtlich bis ${BETA_ENDE}. Wer in der Beta-Phase dabei ist, zahlt danach nur ${PREIS_BETA} € statt ${PREIS_REGULAER} € im Jahr.`;
export const SPONSOR_KURZ = `Optional: Ein Sponsor kann für ${PREIS_SPONSOR} € im Jahr beim Öffnen der Vereinsseite eingeblendet werden („Präsentiert von …“) und übernimmt damit die jährlichen Kosten des Vereins.`;
