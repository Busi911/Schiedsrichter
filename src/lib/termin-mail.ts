import "server-only";
import { emailAlsHtml, emailAlsText, type EmailZeile } from "./email-layout";

export function terminMailText(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: EmailZeile[];
}) {
  return emailAlsText(params);
}

export function terminMailHtml(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: EmailZeile[];
}) {
  return emailAlsHtml(params);
}
