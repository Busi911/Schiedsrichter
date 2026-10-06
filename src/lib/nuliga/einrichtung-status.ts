import type { LogoErgebnis } from "./logo";
import type { VereinsInfo } from "./types";

export type SchrittStatus = "ok" | "pruefen" | "fehler";
export type EinrichtungsSchritt = { schluessel: string; label: string; status: SchrittStatus; detail: string };

export type EinrichtungsBefund = {
  indexName: string;
  clubId: string;
  // null = Vereinsseite nicht lesbar
  info: VereinsInfo | null;
  infoFehler: string | null;
  hallenGespeichert: string[];
  syncStatus: string;
  syncUnvollstaendig: boolean;
  syncMeldungen: string[];
  mannschaften: number;
  // Als Mannschaften des Vereins angelegt (aus den geladenen Liga-Mannschaften); null = nicht ermittelt.
  mannschaftenAngelegt?: number | null;
  mannschaftenModus?: "neu" | "fortgesetzt" | "manuell" | "ohne_liga";
  // Der Verein hatte schon eigene Spielhallen eingetragen; die Hallen der Vereinsseite wurden NICHT übernommen.
  hallenBereitsVorhanden?: boolean;
  termineAngelegt: number | null;
  logo: LogoErgebnis | null;
  logoSicher: boolean;
};

// Rein: macht aus dem Ergebnis der automatischen Einrichtung die Checkliste für den Systemadmin.
// "ok" = automatisch geklappt, "pruefen" = Mensch muss schauen/ergänzen, "fehler" = hat nicht geklappt.
export function bewerteEinrichtung(b: EinrichtungsBefund): EinrichtungsSchritt[] {
  const schritte: EinrichtungsSchritt[] = [];
  const s = (schluessel: string, label: string, status: SchrittStatus, detail: string) =>
    schritte.push({ schluessel, label, status, detail });

  s("gefunden", "Verein bei nuLiga gefunden", "ok", `${b.indexName} (club ${b.clubId})`);

  if (!b.info) {
    s("stammdaten", "Vereinsseite gelesen", "fehler", b.infoFehler ?? "nicht lesbar");
  } else {
    const teile = [b.info.nummer && `VNr. ${b.info.nummer}`, b.info.gruendung && `gegründet ${b.info.gruendung}`, b.info.website].filter(Boolean);
    s("stammdaten", "Vereinsseite gelesen", teile.length > 0 ? "ok" : "pruefen", teile.length > 0 ? teile.join(" · ") : "keine Stammdaten erkannt");
  }

  if (b.hallenBereitsVorhanden) {
    s("hallen", "Spielhallen", "ok", "der Verein hat schon eigene eingetragen — bleiben unverändert");
  } else if (b.hallenGespeichert.length > 0) {
    s("hallen", "Spielhallen übernommen", "pruefen", `${b.hallenGespeichert.join(", ")} — bitte prüfen, ob alle Heimhallen dabei sind`);
  } else {
    s("hallen", "Spielhallen", "pruefen", "keine erkannt — unter Einstellungen → „Eure Spielhallen“ eintragen");
  }

  if (b.syncStatus === "fehler" || (b.mannschaften === 0 && !b.syncUnvollstaendig)) {
    s("mannschaften", "Mannschaften geladen", "fehler", b.syncMeldungen[0] ?? "keine Mannschaften gefunden");
  } else {
    s(
      "mannschaften",
      "Mannschaften geladen",
      b.syncUnvollstaendig ? "pruefen" : "ok",
      `${b.mannschaften} Mannschaften${b.mannschaftenAngelegt ? `, ${b.mannschaftenAngelegt} als Vereins-Mannschaften angelegt` : ""}${b.syncUnvollstaendig ? " — Lauf unvollständig, setzt der Cron fort" : ""}`
    );
  }

  if (b.mannschaftenModus === "manuell") {
    s("vereinsmannschaften", "Mannschaften des Vereins", "ok", "der Verein pflegt eigene Mannschaften — es wurde nichts ergänzt");
  }

  if (b.termineAngelegt === null) {
    s("termine", "Termine angelegt", "pruefen", "erst nach Eintragen der Spielhallen möglich");
  } else {
    s("termine", "Termine angelegt", "ok", `${b.termineAngelegt} künftige Heimspiele`);
  }

  const l = b.logo;
  if (!l) {
    s("logo", "Logo", "pruefen", "nicht geprüft — unter Einstellungen hochladen");
  } else if (l.status === "neu" || l.status === "aktualisiert" || l.status === "unveraendert") {
    s("logo", "Logo von nuLiga übernommen", b.logoSicher ? "ok" : "pruefen", b.logoSicher ? "Bild passt zum Vereinsnamen" : "Zuordnung unsicher (kein passender Bildtext) — bitte ansehen");
  } else if (l.status === "kein_logo") {
    s("logo", "Logo", "pruefen", "bei nuLiga keins gefunden — es erscheinen die Initialen; unter Einstellungen hochladen");
  } else if (l.status === "fehler") {
    s("logo", "Logo", "fehler", l.detail ?? "Download fehlgeschlagen");
  } else {
    s("logo", "Logo", "pruefen", l.status === "manuell" ? "vom Verein hochgeladen, bleibt unverändert" : "automatische Übernahme ist aus");
  }
  return schritte;
}

export const SCHRITT_SYMBOL: Record<SchrittStatus, string> = { ok: "✓", pruefen: "!", fehler: "✕" };
