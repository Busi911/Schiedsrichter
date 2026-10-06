import { attribut, dekodiereEntities } from "@/lib/nuliga/html";

// Winziger, abhängigkeitsfreier HTML-Baum für die HBL-Seite (Server-gerendertes HTML). Bewusst ohne CSS-Klassen und ohne
// Positions-Annahmen (kein nth-child): ausgewertet werden Links, UUIDs in Adressen und der sichtbare Text. Tolerant
// gegenüber nicht geschlossenen Tags; Skripte, Styles und Kommentare werden entfernt.

export type Knoten = { tag: string; attrs: string; kinder: (Knoten | string)[]; eltern: Knoten | null };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g;

export function parseHtml(html: string): Knoten {
  const sauber = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, "");
  const wurzel: Knoten = { tag: "#root", attrs: "", kinder: [], eltern: null };
  let aktuell = wurzel;
  for (const m of sauber.matchAll(TOKEN)) {
    const [gesamt, schliessend, tag, attrs, text] = m;
    if (gesamt.startsWith("<!--")) continue;
    if (text !== undefined) {
      const t = dekodiereEntities(text);
      if (t.trim()) aktuell.kinder.push(t);
      continue;
    }
    const name = tag.toLowerCase();
    if (schliessend) {
      // zum passenden offenen Tag zurück; ohne Treffer ignorieren
      for (let k: Knoten | null = aktuell; k && k.tag !== "#root"; k = k.eltern) {
        if (k.tag === name) {
          aktuell = k.eltern ?? wurzel;
          break;
        }
      }
      continue;
    }
    const knoten: Knoten = { tag: name, attrs: attrs ?? "", kinder: [], eltern: aktuell };
    aktuell.kinder.push(knoten);
    if (!VOID.has(name) && !/\/\s*$/.test(attrs ?? "")) aktuell = knoten;
  }
  return wurzel;
}

export function attr(k: Knoten, name: string): string | null {
  return attribut(`<${k.tag} ${k.attrs}>`, name);
}

export function* nachfahren(k: Knoten): Generator<Knoten> {
  for (const kind of k.kinder) {
    if (typeof kind === "string") continue;
    yield kind;
    yield* nachfahren(kind);
  }
}

// Sichtbarer Text; zwischen Elementen steht ein Leerzeichen (Tabellenzellen, Spans), Bilder haben keinen Text.
export function textInhalt(k: Knoten): string {
  const teile: string[] = [];
  const geh = (n: Knoten) => {
    for (const kind of n.kinder) {
      if (typeof kind === "string") teile.push(kind);
      else {
        teile.push(" ");
        geh(kind);
        teile.push(" ");
      }
    }
  };
  geh(k);
  return teile.join("").replace(/[\s ]+/g, " ").trim();
}

export function alleMit(k: Knoten, tag: string): Knoten[] {
  return [...nachfahren(k)].filter((n) => n.tag === tag);
}
