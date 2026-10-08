import "server-only";
import { appUrl } from "./app-url";
import type { EmailInhalt } from "./email-layout";
import { BETA_ENDE, PREIS_BETA, PREIS_REGULAER } from "./beta-konditionen";

// Outreach-Mail an einen Verein, der über den nuLiga-Index gefunden und
// automatisch eingerichtet wurde. Enthält einen Vorschau-Link (7 Tage gültig),
// damit der Verein die App direkt ausprobieren kann. Die Mail ist im
//berechtigtes-Interesse (Art. 6 Abs. 1 lit. f DSGVO) — die E-Mail-Adresse stammt
// aus dem Impressum der Vereinswebsite (§ 5 TMG / § 55 RStV).
export function outreachInhalt(opt: {
  vereinsname: string;
  vorschauUrl: string;
  gueltigBis: Date;
  email: string;
  abmeldeUrl: string;
  istWiederholung?: boolean;
}): EmailInhalt {
  const DATUM = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
  const einleitung = opt.istWiederholung
    ? `mein Name ist Dennis, ich komme von HandballerPate, einer App für Handballvereine. Sie machen zwei Dinge:`
    : `mein Name ist Dennis, ich komme von HandballerPate, einer App für Handballvereine. Sie macht zwei Dinge:`;
  const retryHinweis = opt.istWiederholung
    ? { text: `Hinweis: Bei meiner letzten Mail waren die Daten Ihres Vereins noch nicht vollständig geladen — das ist nun korrigiert. Der Vorschau-Link führt jetzt zur vollständigen App-Version.`, neueGruppe: true }
    : null;
  return {
    vereinName: opt.vereinsname,
    ueberschrift: `HandballerPate — eine App für den ${opt.vereinsname}`,
    zeilen: [
      `Guten Tag,`,
      { text: einleitung, neueGruppe: true },
      `1. Eine App für Spieler, Eltern und Fans: Spielplan, Ergebnisse, Tabellen, Statistik, Favoriten und Live-Hinweise, installierbar wie eine App. Für den ${opt.vereinsname} habe ich bereits eine Vorschau eingerichtet — Sie können sie direkt ausprobieren:`,
      ...(retryHinweis ? [retryHinweis] : []),
      { text: opt.vorschauUrl, stark: true, neueGruppe: true },
      `2. Für den Verein: Schiedsrichter, Zeitnehmer, Ordner und Kiosk bei Heimspielen einteilen. Der Spielplan kommt automatisch aus nuLiga, Verlegungen und Erinnerungen gehen per Mail raus, offene Dienste sehen Sie auf einen Blick.`,
      `Falls der ${opt.vereinsname} Spielgemeinschaften oder höherklassige Mannschaften hat, die unter einem anderen Verein bei nuLiga geführt werden — die lassen sich nach der Übernahme unter „Einstellungen → Zusatzquellen“ hinzufügen, sodass auch diese Spiele im Plan erscheinen.`,
      { text: `HandballerPate ist in der Beta-Phase und für Sie noch kostenlos (bis ca. ${BETA_ENDE}, danach ${PREIS_BETA} € statt ${PREIS_REGULAER} € netto im Jahr). Die Vorschau gilt bis ${DATUM.format(opt.gueltigBis)}.`, neueGruppe: true },
      `Zum Übernehmen brauche ich nur Namen und E-Mail-Adresse der Person, die den Verein verwalten soll; sie meldet sich mit einem Link an, den ich per E-Mail schicke. Wenn es nicht passt, genügt ein kurzes „Kein Interesse“.`,
      { text: `Viele Grüße`, neueGruppe: true },
      `Dennis · HandballerPate · ${appUrl()}`,
    ],
    cta: { text: "Vorschau öffnen", url: opt.vorschauUrl },
    kleingedrucktes: `Diese E-Mail wurde auf Basis des Impressums Ihrer Vereinswebsite verschickt (berechtigtes Interesse gemäß Art. 6 Abs. 1 lit. f DSGVO). Wenn Sie keine weiteren Mails erhalten möchten:`,
    abmelden: { url: opt.abmeldeUrl, text: "Keine weiteren Mails von HandballerPate:" },
  };
}
