import type { EmailInhalt } from "@/lib/email-layout";

export const FEEDBACK_ANTWORT_BETREFF = "Ihr Feedback zu HandballerPate";

// Zitat der ursprünglichen Rückmeldung: gekürzt, damit die Mail übersichtlich bleibt.
const ZITAT_MAX = 600;

// Antwort des Systemadmins auf eine Rückmeldung (rein, ohne DB). Der Antworttext wird als Absätze übernommen (Leerzeile =
// neuer Absatz), darunter das Zitat der Rückmeldung. Anrede in der Sie-Form wie die übrigen Mails an Vereine.
export function feedbackAntwortInhalt(opt: {
  personName: string | null;
  antwort: string;
  nachricht: string;
}): EmailInhalt {
  const absaetze = opt.antwort
    .trim()
    .split(/\n{2,}/)
    .map((a) => a.trim())
    .filter(Boolean);
  const zitat = opt.nachricht.length > ZITAT_MAX ? `${opt.nachricht.slice(0, ZITAT_MAX)} …` : opt.nachricht;
  return {
    ueberschrift: "Antwort auf Ihr Feedback",
    zeilen: [
      `Hallo${opt.personName ? ` ${opt.personName}` : ""},`,
      ...absaetze,
      { text: "Ihre Nachricht:", neueGruppe: true },
      zitat,
    ],
    kleingedrucktes: "Sie können direkt auf diese Mail antworten.",
  };
}
