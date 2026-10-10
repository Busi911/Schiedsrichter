import "server-only";
import { appUrl } from "./app-url";
import type { EmailInhalt } from "./email-layout";
import { BETA_ENDE, KEIN_RISIKO, PREIS_BETA, PREIS_REGULAER, PREIS_SPONSOR } from "./beta-konditionen";

// Outreach-Mail an einen Verein, der über den nuLiga-Index gefunden und
// automatisch eingerichtet wurde. Enthält einen Vorschau-Link (7 Tage gültig),
// damit der Verein die App direkt ausprobieren kann. Die E-Mail-Adresse stammt
// aus dem nuLiga-Kontaktbereich oder dem Impressum der Vereinswebsite — der
// DSGVO-Hinweis ist deshalb bewusst generisch (Art. 6 Abs. 1 lit. f DSGVO).
export function outreachInhalt(opt: {
  vereinsname: string;
  vorschauUrl: string;
  gueltigBis: Date;
  email: string;
  abmeldeUrl: string;
  uebergabeUrl: string;
  istWiederholung?: boolean;
  hatteInstagramKontakt?: boolean;
}): EmailInhalt {
  const DATUM = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
  const einleitung = opt.istWiederholung
    ? `mein Name ist Dennis, ich komme von HandballerPate, einer App für Handballvereine. Sie machen zwei Dinge:`
    : opt.hatteInstagramKontakt
      ? `mein Name ist Dennis, ich komme von HandballerPate. Ende vergangene Woche hatte ich Sie bereits per Instagram kontaktiert — jetzt melde ich mich per E-Mail, weil sich das besser besprechen lässt. HandballerPate ist eine App für Handballvereine und macht zwei Dinge:`
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
      { text: `Das alles ist in der Beta-Phase für Sie kostenlos — Sie können alles in Ruhe ausprobieren, völlig unverbindlich. ${KEIN_RISIKO} Wer in der Beta dabei ist, zahlt danach ${PREIS_BETA} € statt ${PREIS_REGULAER} € netto im Jahr. Die Beta läuft voraussichtlich bis ${BETA_ENDE}, die Vorschau ist bis ${DATUM.format(opt.gueltigBis)} gültig.`, neueGruppe: true },
      `Optional: Ein Sponsor kann die Kosten übernehmen — dafür erscheint beim Öffnen der Vereinsseite kurz sein Bild. Der Sponsor zahlt ${PREIS_SPONSOR} € im Jahr für den Platz und zusätzlich den Jahrespreis des Vereins (${PREIS_BETA} €). Falls das interessant ist, einfach bei der Übernahme Bescheid geben.`,
      `Wenn Sie den ${opt.vereinsname} testen möchten: Klicken Sie unten auf „Kostenlos testen", geben Sie Namen und E-Mail-Adresse der Person an, die den Verein verwalten soll — sie bekommt einen Login-Link per E-Mail. Wenn es nicht passt, genügt ein kurzes „Kein Interesse“.`,
      { text: `Viele Grüße`, neueGruppe: true },
      `Dennis · HandballerPate · ${appUrl()}`,
    ],
    cta: { text: "Kostenlos testen", url: opt.uebergabeUrl },
    vorschauUrl: opt.vorschauUrl,
    kleingedrucktes: `Diese E-Mail wurde im berechtigten Interesse versendet (gemäß Art. 6 Abs. 1 lit. f DSGVO). Wenn Sie keine weiteren Mails erhalten möchten:`,
    abmelden: { url: opt.abmeldeUrl, text: "Keine weiteren Mails von HandballerPate:" },
  };
}
