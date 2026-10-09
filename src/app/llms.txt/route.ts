import { appUrl } from "@/lib/app-url";
import { BETA_ENDE, PREIS_BETA, PREIS_REGULAER } from "@/lib/beta-konditionen";
import { holeAlleVereine } from "@/lib/liga-oeffentlich";

// Kurzbeschreibung für KI-Assistenten und Crawler (llms.txt-Konvention): was HandballerPate ist, was es kann und wo die öffentlichen Seiten stehen.
// Nur öffentliche, dauerhaft gültige Aussagen — private Bereiche (Admin, Profil, Eintragungs-Links) stehen bewusst nicht drin.
// Dynamisch (stündlich neu): die Liste der Vereine mit öffentlicher Seite ändert sich, sobald ein Verein freigeschaltet wird.
export const revalidate = 3600;

export async function GET() {
  const basis = appUrl();
  let vereine: { name: string; slug: string }[] = [];
  try {
    vereine = await holeAlleVereine();
  } catch {
    // Ohne Datenbank bleibt die Datei trotzdem gültig, nur ohne Vereinsliste.
  }
  const vereinsListe = vereine.map((v) => `- [${v.name}](${basis}/verein/${v.slug}): Ergebnisse, nächste Spiele, Mannschaften, Statistik`).join("\n");
  const text = `# HandballerPate

> HandballerPate ist eine Plattform für Handballvereine in Deutschland: Funktionsträger verwalten, Dienste einteilen, den Hallenspielplan automatisch aus nuLiga und handball.net übernehmen und Spielpläne, Ergebnisse und Tabellen als App für Spieler, Eltern und Fans bereitstellen.

## Für wen
- Vereine: Schiedsrichter, Zeitnehmer, Sekretäre, Ordner, Kioskdienst, Kassierer und Trainer verwalten; Einsätze fair verteilen; offene Dienste sehen; Erinnerungen per E-Mail; Selbsteintragung für Eltern ohne Login.
- Spieler, Eltern, Fans: Spielplan, Ergebnisse, Tabellen und Live-Ticker-Links ihres Vereins ohne Login, als App installierbar, Favoriten nur im eigenen Browser.

## Datenquellen
- nuLiga: Hessischer Handball-Verband (HHV) und Handball-Verband Berlin (HVBerlin); weitere nuLiga-Verbände auf Anfrage.
- handball.net: DHB-Wettbewerbe ab der 3. Liga, Jugendbundesliga.
- NDR: 1. und 2. Handball-Bundesliga (Spielplan, Ergebnisse, Tabelle).
- Übernommen werden nur öffentliche Sport-Daten, keine Personendaten wie Schiedsrichter-Namen.

## Kosten
- Beta-Phase voraussichtlich bis ${BETA_ENDE}, kostenlos. Beta-Vereine zahlen danach ${PREIS_BETA} € netto pro Jahr, andere Vereine ${PREIS_REGULAER} € netto pro Jahr (zzgl. gesetzlicher MwSt.).

## Öffentliche Seiten
- [Startseite mit Funktionen und häufigen Fragen](${basis}/)
- [Alle Vereine mit öffentlicher Seite](${basis}/verein)
- [Hilfe zur App für Spieler und Eltern](${basis}/app-hilfe)
- [Verein registrieren](${basis}/registrieren)
- [Datenschutzerklärung](${basis}/datenschutz)
- [Impressum](${basis}/impressum)
- Jeder Verein: ${basis}/verein/<verein> mit Ergebnissen, nächsten Spielen, Mannschaften, Statistik und je Mannschaft Spielplan, Ergebnisse und Tabelle.
- Sitemap: ${basis}/sitemap.xml
${vereinsListe ? `\n## Vereine mit öffentlicher Seite\n${vereinsListe}\n` : ""}`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
