import "server-only";
import { emailAlsHtml, emailAlsText, type EmailInhalt, type EmailZeile } from "./email-layout";

export function terminMailText(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: EmailZeile[];
  abmelden?: EmailInhalt["abmelden"];
}) {
  return emailAlsText(params);
}

export function terminMailHtml(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: EmailZeile[];
  abmelden?: EmailInhalt["abmelden"];
}) {
  return emailAlsHtml(params);
}
