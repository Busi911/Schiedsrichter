import "server-only";
import { lookup } from "node:dns/promises";
import { FEED_MAX_BYTES, FeedFehler, istOeffentlicheIp, pruefeFeedUrl } from "@/lib/neuigkeiten";

// Ruft den Feed einer Vereinshomepage ab. Die Adresse kommt von einem Verein (nicht vertrauenswürdig), deshalb: nur https,
// jeder Host (auch nach Weiterleitungen) muss zu öffentlichen IP-Adressen auflösen, höchstens 3 Weiterleitungen, 8 s Frist,
// höchstens 1,5 MB, keine Antwort wird weitergereicht (nur der geparste Feed; Fehlertexte sind allgemein). Restrisiko: zwischen
// Namensauflösung und Verbindung kann sich die Adresse ändern (DNS-Rebinding); gelesen wird nur, nie etwas gesendet außer GET.
const FRIST_MS = 8000;
const MAX_WEITERLEITUNGEN = 3;

async function pruefeAufloesung(host: string): Promise<void> {
  let adressen: { address: string }[];
  try {
    adressen = await lookup(host, { all: true });
  } catch {
    throw new FeedFehler("Die Webseite wurde nicht gefunden.");
  }
  if (adressen.length === 0 || !adressen.every((a) => istOeffentlicheIp(a.address))) {
    throw new FeedFehler("Diese Adresse ist nicht öffentlich erreichbar.");
  }
}

export async function holeFeedText(startUrl: string): Promise<string> {
  let url = pruefeFeedUrl(startUrl);
  for (let sprung = 0; sprung <= MAX_WEITERLEITUNGEN; sprung++) {
    await pruefeAufloesung(new URL(url).hostname);
    let antwort: Response;
    try {
      antwort = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FRIST_MS),
        headers: { "User-Agent": "HandballerPate-Feedleser/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5" },
        cache: "no-store",
      });
    } catch {
      throw new FeedFehler("Der Feed ist nicht erreichbar (keine Antwort innerhalb weniger Sekunden).");
    }
    if (antwort.status >= 300 && antwort.status < 400) {
      const ziel = antwort.headers.get("location");
      if (!ziel) throw new FeedFehler("Der Feed leitet ins Leere weiter.");
      try {
        url = pruefeFeedUrl(new URL(ziel, url).toString()); // Weiterleitungsziel gilt dieselben Regeln (https, öffentlich)
      } catch {
        throw new FeedFehler("Der Feed leitet auf eine nicht erlaubte Adresse weiter.");
      }
      continue;
    }
    if (!antwort.ok) throw new FeedFehler(`Der Feed ist nicht erreichbar (HTTP ${antwort.status}).`);
    return liesBegrenzt(antwort);
  }
  throw new FeedFehler("Der Feed leitet zu oft weiter.");
}

async function liesBegrenzt(antwort: Response): Promise<string> {
  const laenge = Number(antwort.headers.get("content-length"));
  if (Number.isFinite(laenge) && laenge > FEED_MAX_BYTES) throw new FeedFehler("Der Feed ist zu groß.");
  const leser = antwort.body?.getReader();
  if (!leser) throw new FeedFehler("Der Feed ist leer.");
  const teile: Uint8Array[] = [];
  let gesamt = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    gesamt += value.byteLength;
    if (gesamt > FEED_MAX_BYTES) {
      await leser.cancel();
      throw new FeedFehler("Der Feed ist zu groß.");
    }
    teile.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(teile));
}
