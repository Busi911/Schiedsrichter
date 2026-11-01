// Überwachung der Abgleiche (Spiel-Abrufe aus nuLiga, handball.net, NDR sowie Übernahme und Ansetzung): erkennt Ausfälle und meldet sie genau einmal.
// Rein, ohne Datenbank. Die Daten liefert sync-ueberwachung-daten.ts, den Versand macht sync-ueberwachung-mail.ts.

export const SCHWELLEN = {
  // Ein Verein wird mindestens alle 6 Stunden geladen (tagsüber, 5–21 Uhr UTC); 24 Stunden ohne Erfolg schließen die Nachtpause sicher ein.
  vereinOhneErfolgStunden: 24,
  fehlerInFolge: 3,
  // Der Quellen-Test läuft stündlich tagsüber: zwei Fehlschläge in Folge sind kein Ausreißer mehr.
  quellentestFehlerInFolge: 2,
  ndrSeiteOhneErfolgStunden: 6,
  uebernahmeStunden: 24,
  ansetzungStunden: 24,
  // So lange bleibt ein offener Befund stumm, bevor eine Erinnerung kommt.
  erinnerungStunden: 24,
  maxNamen: 10,
} as const;

const STUNDE_MS = 3_600_000;

export type LaufZeile = { art: string; status: string; gestartetAm: Date };
export type VereinSync = {
  id: string;
  name: string;
  nuliga: boolean;
  handballNet: boolean;
  erstelltAm: Date;
  spieleAm: Date | null;
  handballNetAm: Date | null;
  uebernahmeAktiv: boolean;
  uebernahmeGeprueftAm: Date | null;
  // Läufe dieses Vereins, neueste zuerst.
  laeufe: LaufZeile[];
};
export type NdrSeite = { schluessel: string; letzterVersuchAm: Date | null; letzterErfolgAm: Date | null; letzterFehler: string | null };
export type QuellenArt = "handball_net" | "nuliga" | "ndr";
export const QUELLEN_NAMEN: Record<QuellenArt, string> = { handball_net: "handball.net (DHB)", nuliga: "nuLiga (HHV)", ndr: "NDR (1./2. HBL)" };
/** Stand einer aktiven Quellen-Prüfung (quellen-test.ts): wann zuletzt versucht/gelungen und wie oft in Folge fehlgeschlagen. */
export type TestStand = { schluessel: string; letzterVersuchAm: Date | null; letzterErfolgAm: Date | null; fehlerInFolge: number; letzterFehler: string | null };
export type Snapshot = {
  jetzt: Date;
  quellentests: TestStand[];
  vereine: VereinSync[];
  ndrSeiten: NdrSeite[];
  ansetzung: { gruppen: number; neuesteAm: Date | null };
};

export type Befund = {
  /** Stabiler Schlüssel (für Wiedererkennung zwischen den Prüfungen). */
  gruppe: string;
  titel: string;
  zeilen: string[];
  /** Betroffene Einheiten (Vereins-IDs, NDR-Seiten): ändert sich die Menge nach oben, wird neu gemeldet. */
  betroffen: string[];
};

export function vorStunden(datum: Date | null, jetzt: Date): string {
  if (!datum) return "noch nie";
  const h = Math.floor((jetzt.getTime() - datum.getTime()) / STUNDE_MS);
  return h < 48 ? `vor ${h} Std.` : `vor ${Math.floor(h / 24)} Tagen`;
}

function aelterAls(datum: Date | null, stunden: number, jetzt: Date, erstelltAm?: Date): boolean {
  // Ein frisch angelegter Verein hatte noch keine Chance auf einen Abruf.
  if (erstelltAm && jetzt.getTime() - erstelltAm.getTime() < stunden * STUNDE_MS) return false;
  return !datum || jetzt.getTime() - datum.getTime() > stunden * STUNDE_MS;
}

function namenListe(namen: string[]): string[] {
  const zeigen = namen.slice(0, SCHWELLEN.maxNamen);
  return namen.length > zeigen.length ? [...zeigen, `… und ${namen.length - zeigen.length} weitere`] : zeigen;
}

function alleFehler(laeufe: LaufZeile[], art: string): boolean {
  const letzte = laeufe.filter((l) => l.art === art).slice(0, SCHWELLEN.fehlerInFolge);
  return letzte.length >= SCHWELLEN.fehlerInFolge && letzte.every((l) => l.status === "fehler");
}

export function pruefeSync(s: Snapshot): Befund[] {
  const { jetzt } = s;
  const befunde: Befund[] = [];
  const vereinsBefund = (gruppe: string, titel: (n: number) => string, treffer: { v: VereinSync; text: string }[]) => {
    if (treffer.length === 0) return;
    befunde.push({ gruppe, titel: titel(treffer.length), zeilen: namenListe(treffer.map((t) => `${t.v.name} (${t.text})`)), betroffen: treffer.map((t) => t.v.id) });
  };

  const nuliga = s.vereine.filter((v) => v.nuliga);
  vereinsBefund(
    "nuliga-veraltet",
    (n) => `nuLiga: ${n} Verein${n === 1 ? "" : "e"} ohne erfolgreichen Abruf seit über ${SCHWELLEN.vereinOhneErfolgStunden} Stunden`,
    nuliga.filter((v) => aelterAls(v.spieleAm, SCHWELLEN.vereinOhneErfolgStunden, jetzt, v.erstelltAm)).map((v) => ({ v, text: `zuletzt ${vorStunden(v.spieleAm, jetzt)}` }))
  );
  vereinsBefund(
    "nuliga-fehler",
    (n) => `nuLiga: ${n} Verein${n === 1 ? "" : "e"} mit ${SCHWELLEN.fehlerInFolge} Fehlern in Folge`,
    nuliga.filter((v) => alleFehler(v.laeufe, "spiele")).map((v) => ({ v, text: `letzter Lauf ${vorStunden(v.laeufe.find((l) => l.art === "spiele")?.gestartetAm ?? null, jetzt)}` }))
  );

  const hnet = s.vereine.filter((v) => v.handballNet);
  vereinsBefund(
    "hnet-veraltet",
    (n) => `handball.net: ${n} Verein${n === 1 ? "" : "e"} ohne erfolgreichen Abruf seit über ${SCHWELLEN.vereinOhneErfolgStunden} Stunden`,
    hnet.filter((v) => aelterAls(v.handballNetAm, SCHWELLEN.vereinOhneErfolgStunden, jetzt, v.erstelltAm)).map((v) => ({ v, text: `zuletzt ${vorStunden(v.handballNetAm, jetzt)}` }))
  );
  vereinsBefund(
    "hnet-fehler",
    (n) => `handball.net: ${n} Verein${n === 1 ? "" : "e"} mit ${SCHWELLEN.fehlerInFolge} Fehlern in Folge`,
    hnet.filter((v) => alleFehler(v.laeufe, "handball_net")).map((v) => ({ v, text: `letzter Lauf ${vorStunden(v.laeufe.find((l) => l.art === "handball_net")?.gestartetAm ?? null, jetzt)}` }))
  );

  // NDR: Seiten, deren letzter Abruf fehlschlug und die seit Stunden nicht mehr geladen werden konnten (ein einzelner Ausreißer zählt nicht).
  const ndrKaputt = s.ndrSeiten.filter(
    (p) =>
      p.letzterFehler &&
      (!p.letzterErfolgAm || (p.letzterVersuchAm && p.letzterVersuchAm > p.letzterErfolgAm)) &&
      aelterAls(p.letzterErfolgAm, SCHWELLEN.ndrSeiteOhneErfolgStunden, jetzt)
  );
  const proLiga = new Map<string, NdrSeite[]>();
  for (const p of ndrKaputt) {
    const liga = p.schluessel.split(":")[1] ?? "?";
    proLiga.set(liga, [...(proLiga.get(liga) ?? []), p]);
  }
  for (const [liga, seiten] of [...proLiga].sort(([a], [b]) => a.localeCompare(b))) {
    befunde.push({
      gruppe: `ndr-${liga}`,
      titel: `NDR ${liga.toUpperCase()}: ${seiten.length} Seite${seiten.length === 1 ? "" : "n"} seit über ${SCHWELLEN.ndrSeiteOhneErfolgStunden} Stunden nicht ladbar`,
      zeilen: namenListe(seiten.map((p) => `${p.schluessel.split(":").slice(2).join(":")}: ${(p.letzterFehler ?? "").slice(0, 120)}`)),
      betroffen: seiten.map((p) => p.schluessel),
    });
  }

  // Aktiver Quellen-Test: die Quelle antwortet nicht oder ihr Format passt nicht mehr zu unseren Parsern (die Zeitstempel-Prüfungen oben
  // sehen das erst nach Stunden und können es nicht von "Cron lief nicht" unterscheiden).
  for (const art of Object.keys(QUELLEN_NAMEN) as QuellenArt[]) {
    const kaputt = s.quellentests.filter((t) => t.schluessel.startsWith(`${art}:`) && t.fehlerInFolge >= SCHWELLEN.quellentestFehlerInFolge);
    if (kaputt.length === 0) continue;
    befunde.push({
      gruppe: `quellentest-${art}`,
      titel: `${QUELLEN_NAMEN[art]}: Abruf-Test schlägt fehl (${kaputt.length} Prüfung${kaputt.length === 1 ? "" : "en"})`,
      zeilen: namenListe(kaputt.map((t) => `${t.schluessel.split(":").slice(1).join(":")}: ${(t.letzterFehler ?? "").slice(0, 160)} (zuletzt erfolgreich ${vorStunden(t.letzterErfolgAm, jetzt)})`)),
      betroffen: kaputt.map((t) => t.schluessel),
    });
  }

  // Übernahme der Liga-Spiele in die Termine ("Abgleich"): läuft stündlich, jeder aktive Verein wird mindestens täglich geprüft.
  vereinsBefund(
    "uebernahme-veraltet",
    (n) => `Übernahme (Abgleich Liga → Termine): ${n} Verein${n === 1 ? "" : "e"} seit über ${SCHWELLEN.uebernahmeStunden} Stunden nicht geprüft`,
    s.vereine
      .filter((v) => v.uebernahmeAktiv && (v.nuliga || v.handballNet) && aelterAls(v.uebernahmeGeprueftAm, SCHWELLEN.uebernahmeStunden, jetzt, v.erstelltAm))
      .map((v) => ({ v, text: `zuletzt ${vorStunden(v.uebernahmeGeprueftAm, jetzt)}` }))
  );

  if (s.ansetzung.gruppen > 0 && aelterAls(s.ansetzung.neuesteAm, SCHWELLEN.ansetzungStunden, jetzt)) {
    befunde.push({
      gruppe: "ansetzung-veraltet",
      titel: `Ansetzung (Schiedsrichter/Zeitnehmer): seit über ${SCHWELLEN.ansetzungStunden} Stunden keine Staffel geprüft`,
      zeilen: [`Zuletzt geprüft: ${vorStunden(s.ansetzung.neuesteAm, jetzt)} (${s.ansetzung.gruppen} Staffeln)`],
      betroffen: ["ansetzung"],
    });
  }
  return befunde;
}

// --- Wann wird gemeldet? ---------------------------------------------------

export type Zustand = Record<string, { betroffen: string[]; gemeldetAm: string }>;

export type Entscheidung = {
  /** Diese Befunde kommen in die Mail (neu, erweitert oder Erinnerung). */
  senden: Befund[];
  /** Gruppen, die vorher offen waren und jetzt nicht mehr: "wieder in Ordnung". */
  behoben: string[];
  zustand: Zustand;
};

/**
 * Jeder Befund wird gemeldet, wenn er neu ist, wenn weitere Betroffene dazugekommen sind oder wenn die letzte Meldung länger als
 * `erinnerungStunden` her ist; sonst bleibt er stumm. Verschwindet ein Befund, gibt es einmal "behoben".
 */
export function entscheideMeldung(vorher: Zustand, befunde: Befund[], jetzt: Date): Entscheidung {
  const senden: Befund[] = [];
  const zustand: Zustand = {};
  for (const b of befunde) {
    const frueher = vorher[b.gruppe];
    const neueBetroffene = !frueher || b.betroffen.some((id) => !frueher.betroffen.includes(id));
    const erinnern = !!frueher && jetzt.getTime() - new Date(frueher.gemeldetAm).getTime() >= SCHWELLEN.erinnerungStunden * STUNDE_MS;
    if (neueBetroffene || erinnern) {
      senden.push(b);
      zustand[b.gruppe] = { betroffen: b.betroffen, gemeldetAm: jetzt.toISOString() };
    } else {
      zustand[b.gruppe] = { betroffen: b.betroffen, gemeldetAm: frueher.gemeldetAm };
    }
  }
  const behoben = Object.keys(vorher).filter((g) => !befunde.some((b) => b.gruppe === g));
  return { senden, behoben, zustand };
}
