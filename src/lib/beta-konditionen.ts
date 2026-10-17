// Konditionen der Beta-Phase (Stand 11.10.2026, Ende der Beta fest: 30.11.2026) an EINER Stelle: Startseite, Registrierung und Ansprache-Text zeigen dieselben Zahlen.
// Bei Änderung (Ende der Beta, neue Preise) nur hier anpassen.
export const BETA_ENDE = "30.11.2026";
export const PREIS_REGULAER = 300; // € im Jahr
export const PREIS_BETA = 200; // € im Jahr für Vereine, die in der Beta-Phase dabei sind
export const PREIS_SPONSOR = 200; // € im Jahr für den Sponsor-Platz (optional), zusätzlich zur Übernahme des Vereinspreises
// Sind alle Beta-Plätze vergeben oder ist die Beta vorbei, testet ein neuer Verein 14 Tage kostenlos (lib/abrechnung.ts TESTPHASE_TAGE), danach Rechnung.
export const TESTPHASE_KURZ = `14 Tage kostenlos testen, ohne Zahlungsdaten und ohne automatische Verlängerung. Wer danach weitermachen möchte, bestätigt es selbst: ${PREIS_REGULAER} € im Jahr (netto), Rechnung per E-Mail, Zahlungsziel 30 Tage.`;
export const NETTO = "Alle Preise netto (zzgl. gesetzl. MwSt.).";

export const BETA_KURZ = `Die Beta läuft bis ${BETA_ENDE}. Wer in der Beta-Phase dabei ist, zahlt danach nur ${PREIS_BETA} € statt ${PREIS_REGULAER} € im Jahr (netto).`;
export const KEIN_RISIKO = "Vor dem Ende der Beta-Phase könnt ihr einfach Bescheid sagen, dass ihr HandballerPate nicht braucht: Dann wird alles gelöscht, und es fallen keine Zahlungen an.";
// Der Sponsor zahlt ALLES: den Vereinspreis (Beta: 200 €) UND den Sponsor-Platz (200 €) — der Verein selbst zahlt dann nichts.
export const SPONSOR_KURZ = `Optional: Ein Sponsor kann beim Öffnen der Vereinsseite eingeblendet werden („Präsentiert von …“). Er zahlt ${PREIS_SPONSOR} € im Jahr für den Platz und übernimmt zusätzlich den Jahrespreis des Vereins (${PREIS_BETA} €) — der Verein zahlt dann nichts.`;

export const KONTAKT_EMAIL = "info@deweconsulting.de";

// Ablauf nach dem Ende der Beta, kurz für Demo-Seite und Einstellungen (Details: abrechnung.ts, zahlung-erinnerung.ts).
export const ABLAUF_NACH_BETA = [
  `Bis ${BETA_ENDE}: alles kostenlos und voll nutzbar.`,
  "Ab 31.10.2026: Euer Vereinsadmin bekommt eine Mail mit den Konditionen, im Admin-Bereich steht ein Hinweis.",
  `Ab 01.12.2026: Rechnung über ${PREIS_BETA} € netto für 12 Monate per E-Mail an die Rechnungsadresse. Zahlungsziel ist der 31.12.2026.`,
  "Danach: Erinnerung per Mail und 30 Tage Karenz. Ohne Zahlung wird der Zugang gesperrt, die Daten bleiben erhalten.",
  "Aussteigen geht jederzeit vor Ende der Beta (Einstellungen → Gefahrenzone → „Verein löschen“ oder per Mail), dann fällt nichts an.",
];
