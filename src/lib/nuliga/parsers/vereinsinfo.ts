import { attribut, tabellen, textVon, zeilen, zellen } from "../html";
import type { ParseErgebnis, VereinsInfo } from "../types";

// clubInfoDisplay: Stammdaten als Zeilen "Beschriftung | Wert". Gelesen wird NUR, was unten ausdrücklich
// benannt ist (Name, Vereinsnummer, Gründung, Website, Stammvereine, Hallen) — jede andere Zeile
// (Telefon, E-Mail, Anschrift, Ansprechpartner, ...) wird nie angefasst.
export function parseVereinsInfo(html: string): ParseErgebnis<VereinsInfo> {
  const warnungen: string[] = [];
  const info: VereinsInfo = { name: null, nummer: null, gruendung: null, website: null, stammvereine: [], hallen: [], logoPfad: null, logoSicher: false };

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) info.name = textVon(h1[1]) || null;

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
      } else if (/^(hallen|spielst(ä|ae)tten|sporthallen)/.test(label)) {
        info.hallen = nameninListe(wert.html);
      }
    }
  }

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
