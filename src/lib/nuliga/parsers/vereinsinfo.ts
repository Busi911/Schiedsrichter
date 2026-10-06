import { attribut, ersteH1, tabellen, textVon, zeilen, zellen } from "../html";
import type { ParseErgebnis, VereinsInfo } from "../types";

// clubInfoDisplay: Stammdaten als Zeilen "Beschriftung | Wert". Gelesen wird NUR, was unten ausdrücklich
// benannt ist (Name, Vereinsnummer, Gründung, Website, Stammvereine, Hallen) — jede andere Zeile
// (Telefon, E-Mail, Anschrift, Ansprechpartner, ...) wird nie angefasst.
export function parseVereinsInfo(html: string): ParseErgebnis<VereinsInfo> {
  const warnungen: string[] = [];
  const info: VereinsInfo = { name: null, nummer: null, gruendung: null, website: null, stammvereine: [], hallen: [], hallenNummern: {}, logoPfad: null, logoSicher: false };

  // Die <h1> trägt mehrere Zeilen: zuerst der Verband ("Hessischer Handball-Verband e.V."), zuletzt der Verein.
  info.name = ersteH1(html).at(-1) ?? null;

  for (const tabelle of tabellen(html)) {
    for (const zeile of zeilen(tabelle)) {
      const z = zellen(zeile);
      if (z.length < 2) continue;
      const label = z[0].text.toLowerCase().replace(/:$/, "").trim();
      const wert = z[1];

      if (/^vereinsnummer|^vereins-?nr/.test(label)) {
        const n = wert.text.match(/\d{3,7}/);
        if (n) info.nummer = n[0];
      } else if (/^gr(ü|ue)ndung|^gegr(ü|ue)ndet/.test(label)) {
        const j = wert.text.match(/\b(18|19|20)\d{2}\b/);
        if (j) info.gruendung = Number(j[0]);
      } else if (/^(homepage|website|internet|webseite)/.test(label)) {
        const href = wert.html.match(/<a\b[^>]*>/i);
        const url = (href ? attribut(href[0], "href") : null) ?? wert.text;
        if (/^https?:\/\/[^\s]+$/i.test(url)) info.website = url;
      } else if (/^stammverein/.test(label)) {
        info.stammvereine = nameninListe(wert.html);
      }
    }
  }

  // Stammdaten außerhalb von Zwei-Spalten-Tabellen (nuLiga mischt Überschriften, Textknoten, Links, Listen): über die
  // BESCHRIFTUNG im sichtbaren Text suchen ("VNr. 14175", "Gründungsjahr 1965", "Website www.…") — egal in welchem Markup.
  const sichtbar = textVon(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "));
  if (!info.nummer) info.nummer = sichtbar.match(/\b(?:VNr\.?|Vereinsnummer|Vereins-Nr\.?)\s*:?\s*(\d{3,7})\b/i)?.[1] ?? null;
  if (!info.gruendung) {
    const j = sichtbar.match(/\bGr(?:ü|ue)ndungsjahr\s*:?\s*((?:18|19|20)\d{2})\b/i)?.[1] ?? sichtbar.match(/\bgegr(?:ü|ue)ndet\s*:?\s*((?:18|19|20)\d{2})\b/i)?.[1];
    if (j) info.gruendung = Number(j);
  }
  if (!info.website) info.website = websiteAusText(sichtbar);

  // Hallen: kein Tabellenfeld, sondern ein eigener Abschnitt (Überschrift "Hallen" + Liste von Links).
  const hallen = findeHallen(html);
  info.hallen = hallen.eintraege.map((h) => h.name);
  for (const h of hallen.eintraege) if (h.nummer) info.hallenNummern[h.name] = h.nummer;
  if (!hallen.gefunden) warnungen.push('Kein Abschnitt "Hallen" gefunden (HTML-Struktur geändert?)');
  else if (hallen.eintraege.length === 0) warnungen.push('Abschnitt "Hallen" ohne erkennbare Einträge');

  const logo = findeLogo(html, info.name);
  info.logoPfad = logo?.pfad ?? null;
  info.logoSicher = logo?.sicher ?? false;

  if (!info.name) warnungen.push("Kein Vereinsname gefunden (HTML-Struktur geändert?)");
  return { daten: info, warnungen };
}

// Einträge einer Zelle: je Link oder je <br>/Zeilenumbruch ein Name.
function nameninListe(html: string): string[] {
  const anker = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => textVon(m[1])).filter(Boolean);
  const teile = anker.length > 0 ? anker : html.split(/<br\s*\/?>|\n/i).map((t) => textVon(t)).filter(Boolean);
  return [...new Set(teile)];
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();

// Vereinsbild: semantisch, nicht über eine DOM-Position. Kandidaten sind Bilder, die über die nuLiga-Bilder-
// auslieferung kommen (Pfad endet auf /wr mit wodata=...). Passt der alt-Text zum Vereinsnamen, ist es das
// Logo ("sicher"). Gibt es keinen solchen Treffer, aber GENAU EIN Kandidat, wird er mit sicher=false
// vorgeschlagen; mehrere unklare Kandidaten (z.B. Werbebanner) werden NICHT geraten.
function findeLogo(html: string, name: string | null): { pfad: string; sicher: boolean } | null {
  const kandidaten: { pfad: string; alt: string }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attribut(m[0], "src");
    if (!src || !/\/wr(\?|$)/i.test(src.split("#")[0]) || !/[?&]wodata=/i.test(src)) continue;
    const breite = Number(attribut(m[0], "width"));
    const hoehe = Number(attribut(m[0], "height"));
    if ((breite > 0 && breite <= 2) || (hoehe > 0 && hoehe <= 2)) continue; // Zählpixel
    kandidaten.push({ pfad: src, alt: attribut(m[0], "alt") ?? "" });
  }
  if (kandidaten.length === 0) return null;
  const n = name ? norm(name) : "";
  const passend = n ? kandidaten.find((k) => norm(k.alt) === n || (norm(k.alt) && n.includes(norm(k.alt))) || norm(k.alt).includes(n)) : undefined;
  if (passend) return { pfad: passend.pfad, sicher: true };
  return kandidaten.length === 1 ? { pfad: kandidaten[0].pfad, sicher: false } : null;
}

// Nur eine ABSCHLIESSENDE reine Zahl in Klammern ist die Hallennummer ("Stadthalle Linden (14151)"); andere
// Klammern bleiben ("Sporthalle (Nord)", "Halle (alt) (12)" -> "Halle (alt)").
export function bereinigeHallenname(wert: string): { name: string; nummer: string | null } {
  const text = wert.replace(/[\s\u00a0]+/g, " ").trim();
  const m = text.match(/\s*\((\d+)\)\s*$/);
  return m ? { name: text.slice(0, m.index).trim(), nummer: m[1] } : { name: text, nummer: null };
}

const HALLEN_LABEL = /(?:^|>)\s*(?:hallen|spielst(?:ä|ae|&auml;)tten|sporthallen)\s*:?\s*(?=<)/gi;

// Abschnitt "Hallen" in beliebigem Markup: ein Element, dessen GANZER Text "Hallen" ist (Überschrift, fett, Zelle,
// dt ...), danach die Links bis zur nächsten Überschrift (höchstens 3000 Zeichen). Tragen Links eine Hallennummer
// in Klammern ("... (14151)"), zählen nur diese (sonst z.B. Mannschafts- oder Kontaktlinks im Umfeld); fehlt sie, gelten
// alle Links bzw. bei reinem Text die Zeilen (<br>/<li>) des Abschnitts. Vereins-/Mail-/Telefonlinks zählen nie.
export function findeHallen(html: string): { gefunden: boolean; rohtexte: string[]; eintraege: { name: string; nummer: string | null }[] } {
  let gefunden = false;
  for (const treffer of html.matchAll(HALLEN_LABEL)) {
    gefunden = true;
    const start = (treffer.index ?? 0) + treffer[0].length;
    let abschnitt = html.slice(start, start + 3000);
    // Das Label-Element selbst schließen, dann bis zur nächsten Überschrift lesen.
    const ende = abschnitt.search(/<h[1-6]\b/i);
    if (ende >= 0) abschnitt = abschnitt.slice(0, ende);
    // Steht das Label in einer Tabellenzeile, endet der Abschnitt mit dieser Zeile.
    const davor = html.slice(0, treffer.index ?? 0);
    if (davor.lastIndexOf("<tr") > davor.lastIndexOf("</tr>")) {
      const zeilenEnde = abschnitt.search(/<\/tr>/i);
      if (zeilenEnde >= 0) abschnitt = abschnitt.slice(0, zeilenEnde);
    }

    const anker = [...abschnitt.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: attribut(`<a ${m[1]}>`, "href") ?? "", text: textVon(m[2]) }))
      .filter((a) => a.text && !/^(mailto|tel):|clubInfoDisplay|clubTeams|clubSearch/i.test(a.href));
    let rohtexte = anker.filter((a) => /\(\d+\)\s*$/.test(a.text)).map((a) => a.text);
    if (rohtexte.length === 0) rohtexte = anker.map((a) => a.text);
    if (rohtexte.length === 0) {
      rohtexte = abschnitt
        .split(/<br\s*\/?>|<\/li>|<\/p>|\n/i)
        .map((t) => textVon(t))
        .filter((t) => /\(\d+\)\s*$/.test(t));
    }
    const eintraege: { name: string; nummer: string | null }[] = [];
    for (const roh of rohtexte) {
      const h = bereinigeHallenname(roh);
      if (h.name && !eintraege.some((e) => e.name === h.name)) eintraege.push(h);
    }
    if (eintraege.length > 0) return { gefunden: true, rohtexte, eintraege };
  }
  return { gefunden, rohtexte: [], eintraege: [] };
}

// "Website www.tus-vollnkirchen.de" / "Homepage: https://…" -> "https://www.tus-vollnkirchen.de". nuLiga-eigene Adressen zählen nie.
function websiteAusText(sichtbar: string): string | null {
  const m = sichtbar.match(/\b(?:Website|Homepage|Webseite|Internet)\s*:?\s*((?:https?:\/\/)?(?:[a-z0-9äöüß-]+\.)+[a-z]{2,}(?:\/[^\s"<>]*)?)/i);
  if (!m) return null;
  const roh = m[1].replace(/[.,;)]+$/, "");
  const url = /^https?:\/\//i.test(roh) ? roh : `https://${roh}`;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith("liga.nu") || host.endsWith("handball.net")) return null;
    return url;
  } catch {
    return null;
  }
}
