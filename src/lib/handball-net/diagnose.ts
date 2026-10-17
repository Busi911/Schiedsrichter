import { maskierePersonendaten } from "@/lib/bildtyp";

// Hilfen für /system/handball-net-diagnose: zeigt die ROHE Antwort der handball.net-API für ein Spiel, damit belegt ist, welche Felder
// (Status, Spielstand, Ticker-/Ereignis-Hinweise) tatsächlich geliefert werden. Nur Systemadmin, nur lesend, schreibt nichts.
// Die API liefert in denselben Antworten Personendaten (Schiedsrichter, Zeitnehmer, Verantwortliche, Kontakte): Werte unter solchen
// Schlüsseln werden ersetzt, E-Mail/Telefon in Texten maskiert. Die Struktur (Schlüssel) bleibt sichtbar.
const PERSONEN_SCHLUESSEL =
  /referee|schiedsrichter|timekeeper|zeitnehmer|secretary|sekret|delegate|official|responsible|verantwort|manager|coach|trainer|contact|kontakt|email|mail|phone|telefon|mobile|fax|address|adresse|street|strasse|zip|postal|city|person|player|spieler|first_?name|last_?name|surname|birth|nickname/i;

export function maskiereHnetJson(wert: unknown, tiefe = 0): unknown {
  if (tiefe > 12) return "[zu tief]";
  if (Array.isArray(wert)) return wert.slice(0, 50).map((x) => maskiereHnetJson(x, tiefe + 1));
  if (typeof wert === "object" && wert !== null) {
    return Object.fromEntries(
      Object.entries(wert as Record<string, unknown>).map(([k, v]) => [
        k,
        PERSONEN_SCHLUESSEL.test(k) ? "[Personendaten ausgeblendet]" : maskiereHnetJson(v, tiefe + 1),
      ])
    );
  }
  return typeof wert === "string" ? maskierePersonendaten(wert) : wert;
}

// Schlüsselpfade mit Werttyp, z.B. "status.is_finished: boolean": zeigt auf einen Blick, welche Felder es gibt.
export function schluesselPfade(wert: unknown, pfad = "", ausgabe: string[] = [], tiefe = 0): string[] {
  if (tiefe > 12 || ausgabe.length > 400) return ausgabe;
  if (Array.isArray(wert)) {
    ausgabe.push(`${pfad || "(Wurzel)"}: Array[${wert.length}]`);
    if (wert.length > 0) schluesselPfade(wert[0], `${pfad}[]`, ausgabe, tiefe + 1);
  } else if (typeof wert === "object" && wert !== null) {
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
      const p = pfad ? `${pfad}.${k}` : k;
      if (typeof v === "object" && v !== null) schluesselPfade(v, p, ausgabe, tiefe + 1);
      else ausgabe.push(`${p}: ${v === null ? "null" : typeof v}`);
    }
  }
  return ausgabe;
}

// Nur API-Pfade (GET), keine Umleitung auf fremde Hosts, keine Pfadtricks.
export function istErlaubterApiPfad(pfad: string): boolean {
  return /^\/api\/[A-Za-z0-9_\-./?=&,%:+]*$/.test(pfad) && !pfad.includes("..") && !pfad.includes("//");
}
