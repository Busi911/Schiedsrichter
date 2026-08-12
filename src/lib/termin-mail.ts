import "server-only";
import { emailAlsHtml, emailAlsText } from "./email-layout";

export function terminMailText(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: string[];
}) {
  return emailAlsText(params);
}

export function terminMailHtml(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: string[];
}) {
  return emailAlsHtml(params);
}
