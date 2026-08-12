// Import von Rundenspielen (Pflichtspielen aus dem Liga-Spielplan) aus einem
// nuLiga-JSON-Export pro Halle. Der Export enthält ALLE Spiele an dieser
// Halle — nicht nur die der eigenen Mannschaften —, da die eigene Halle für
// jedes dort stattfindende Spiel Ordner-/Kioskdienst braucht (siehe
// src/lib/dienste.ts). Ein Verein mit mehreren Hallen kann mehrere Exporte
// (oder einen Export mit mehreren location-Blöcken) hochladen.
//
// Reine Parsing-/Normalisierungslogik ohne DB-Zugriff, damit sie ohne
// Testdatenbank getestet werden kann (siehe rundenspiel-import.test.ts).

export type RundenspielEreignis = {
  uid: string;
  start: Date;
  ort: string;
  beschreibung: string;
  heimMannschaft: string;
  auswaertsMannschaft: string;
  // Jugendklasse (z.B. "mJC") bzw. Männer/Frauen ("Mä/männl.", "Fr/weibl.")
  // — separat von beschreibung gehalten, damit "Unbekannte Mannschaften"
  // gleichnamige Vereine mit mehreren Mannschaften auseinanderhalten kann
  // (siehe gruppiereUnbekannteMannschaften unten).
  kategorie: string | null;
  // true = echtes Ligaspiel (Spielnummer vom Verband vergeben), false =
  // Freundschaftsspiel/Turnier — separat von beschreibung gehalten, damit
  // Typ-Badges in Kalenderansichten die korrekte Bezeichnung zeigen können
  // (siehe bildeUid oben zur selben Spielnummer-basierten Unterscheidung).
  pflichtspiel: boolean;
};

export type RundenspielParseFehler = { index: number; grund: string };

export type RundenspielParseErgebnis = {
  ereignisse: RundenspielEreignis[];
  fehler: RundenspielParseFehler[];
};

// UID-Strategie: gameNumber ist bei echten Liga-Pflichtspielen die vom
// Verband vergebene, über die Saison stabile Spielnummer — bleibt bei einer
// Terminverlegung (neues Datum/Uhrzeit im nächsten Export) unverändert.
// Deshalb OHNE Datum/Zeit im Schlüssel, sobald eine echte gameNumber
// vorliegt: eine Verlegung aktualisiert dann den bestehenden Termin statt
// einen doppelten Eintrag anzulegen. "0" ist im Export der Platzhalter für
// "keine Nummer vergeben" (z.B. Freundschaftsspiele/Turniere) — dort gibt
// es keine stabile ID, also bleibt Datum/Zeit im Schlüssel als bestmöglicher
// Ersatz (eine Verlegung würde dort weiterhin einen neuen Eintrag erzeugen).
function bildeUid(locationId: number | string, event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as Record<string, unknown>;
  if (
    typeof e.date !== "string" ||
    typeof e.time !== "string" ||
    typeof e.home !== "string" ||
    typeof e.away !== "string"
  ) {
    return null;
  }
  const gameNumber = typeof e.gameNumber === "string" ? e.gameNumber : "";
  if (gameNumber && gameNumber !== "0") {
    return `rundenspiel:${locationId}:${e.home}:${e.away}:${gameNumber}`;
  }
  return `rundenspiel:${locationId}:${e.date}:${e.time}:${e.home}:${e.away}`;
}

export function parseRundenspielJson(text: string): RundenspielParseErgebnis {
  let daten: unknown;
  try {
    daten = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }

  if (!Array.isArray(daten)) {
    throw new Error(
      "Erwarte ein JSON-Array (nuLiga-Export pro Halle, ggf. mehrere Hallen-Blöcke)."
    );
  }

  const ereignisse: RundenspielEreignis[] = [];
  const fehler: RundenspielParseFehler[] = [];
  let laufenderIndex = 0;

  for (const block of daten) {
    if (typeof block !== "object" || block === null) {
      fehler.push({ index: laufenderIndex, grund: "Kein gültiger Hallen-Block." });
      laufenderIndex++;
      continue;
    }
    const b = block as Record<string, unknown>;
    const location = b.location as Record<string, unknown> | undefined;
    const locationName =
      typeof location?.name === "string" ? location.name : undefined;
    const locationId = (location?.id as number | string | undefined) ?? locationName;
    const events = Array.isArray(b.events) ? b.events : [];

    for (const event of events) {
      laufenderIndex++;
      if (typeof event !== "object" || event === null) {
        fehler.push({ index: laufenderIndex, grund: "Kein gültiges Spiel-Objekt." });
        continue;
      }
      const e = event as Record<string, unknown>;
      const uid = bildeUid(locationId ?? "unbekannt", e);
      const startWert = typeof e.start === "string" ? e.start : undefined;
      const start = startWert ? new Date(startWert) : undefined;

      if (!uid || !start || Number.isNaN(start.getTime())) {
        fehler.push({
          index: laufenderIndex,
          grund: `Unvollständiges Spiel (${
            typeof e.title === "string" ? e.title : "ohne Titel"
          }).`,
        });
        continue;
      }

      const ort =
        (typeof e.location === "string" ? e.location : undefined) ??
        locationName ??
        "";
      const heimMannschaft = String(e.home);
      const auswaertsMannschaft = String(e.away);
      const titel =
        typeof e.title === "string"
          ? e.title
          : `${heimMannschaft} – ${auswaertsMannschaft}`;
      // category = Jugendklasse (z.B. "MJC", "WJB") bzw. Männer/Frauen
      // ("Mä/männl.", "Fr/weibl.") — an den Titel angehängt, da die exakten
      // Kürzel je Landesverband variieren und hier nicht übersetzt werden.
      const kategorie = typeof e.category === "string" ? e.category : null;
      // gameNumber "0"/fehlend ist EIN Signal für "kein echtes Pflichtspiel",
      // aber nicht ausreichend: der HHV vergibt innerhalb seiner eigenen
      // Sammelstaffel für Freundschaftsspiele/Turniere ("Gießen
      // Freundschaftsspiele u. Turniere", siehe league-Beispiel unten)
      // ebenfalls fortlaufende, von 0 verschiedene Nummern — ein Spiel mit
      // gameNumber "1" kann also trotzdem ein Freundschaftsspiel sein.
      // Beobachtet im echten Export: Staffel-Rohtext beginnt bei dieser
      // Sammelstaffel zuverlässig mit "F " (Kürzel für Freundschaftsspiel),
      // z.B. "F FrSp (M) HSG Dutenhofen/Münchholzhausen2 - MT Melsungen2"
      // oder "F 2026-08-09 (MJC) HSG Dutenhofen/Münchholzhausen- SG
      // Wehrheim" — echte Ligen (Kreisliga, Bezirksliga, ...) tun das nicht.
      const gameNumberRoh = typeof e.gameNumber === "string" ? e.gameNumber : undefined;
      const leagueRoh = typeof e.league === "string" ? e.league : undefined;
      const istFreundschaftsstaffel = !!leagueRoh && /^F\s/.test(leagueRoh.trim());
      const istPflichtspiel =
        !!gameNumberRoh && gameNumberRoh !== "0" && !istFreundschaftsstaffel;
      const spielArt = istPflichtspiel
        ? `Ligaspiel Nr. ${gameNumberRoh}`
        : "Freundschaftsspiel/Turnier";
      // Zellen nach Heim/Auswärts im nuLiga-Export (z.B. Schiedsrichter-
      // Kürzel) — Format/Vorhandensein je Landesverband unbestätigt, daher
      // roh angehängt statt geraten interpretiert (siehe Kommentar in
      // nuliga-scraper.ts).
      const zusatz = typeof e.zusatz === "string" ? e.zusatz : undefined;
      const beschreibung = [titel, kategorie, spielArt, zusatz]
        .filter(Boolean)
        .join(" · ");

      ereignisse.push({
        uid,
        start,
        ort,
        beschreibung,
        heimMannschaft,
        auswaertsMannschaft,
        kategorie,
        pflichtspiel: istPflichtspiel,
      });
    }
  }

  return { ereignisse, fehler };
}

const ROEMISCH_ZU_ARABISCH: Record<string, string> = {
  I: "1",
  II: "2",
  III: "3",
  IV: "4",
  V: "5",
};

// Vereinsnamen tauchen in Ligadaten uneinheitlich auf ("Herren II" vs.
// "Herren 2"), da manche Verbände/Melder römische, andere arabische Ziffern
// verwenden. Normalisiert vor jedem Vergleich, damit dieselbe Mannschaft
// nicht doppelt erkannt bzw. vorgeschlagen wird.
export function normalisiereMannschaftsname(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(iv|v|i{1,3})\b/gi, (m) => ROEMISCH_ZU_ARABISCH[m.toUpperCase()] ?? m);
}

// Best-effort-Zuordnung zu einer bestehenden Mannschaft: exakter Name-Match
// (normalisiert) oder die Mannschaft ist als Wortteil im Heim-/
// Auswärtsnamen enthalten (z.B. Mannschaft "Herren 1" in Heimname
// "TSF Heuchelheim Herren 1"). Liefert null, wenn nichts eindeutig passt —
// das Spiel wird trotzdem importiert, nur ohne Mannschaftsverknüpfung.
export function findeMannschaft(
  ereignis: RundenspielEreignis,
  mannschaften: { id: string; name: string }[]
): string | null {
  const heimNorm = normalisiereMannschaftsname(ereignis.heimMannschaft);
  const auswaertsNorm = normalisiereMannschaftsname(ereignis.auswaertsMannschaft);

  const exakt = mannschaften.find((m) => {
    const mNorm = normalisiereMannschaftsname(m.name);
    return mNorm === heimNorm || mNorm === auswaertsNorm;
  });
  if (exakt) return exakt.id;

  const kandidatText = `${heimNorm} ${auswaertsNorm}`;
  const treffer = mannschaften.filter((m) =>
    kandidatText.includes(normalisiereMannschaftsname(m.name))
  );
  return treffer.length === 1 ? treffer[0].id : null;
}

export type UnbekannteMannschaft = {
  normalisiert: string;
  anzeigeName: string;
  kategorie: string | null;
  anzahlSpiele: number;
};

// Fasst Heimnamen aus noch nicht verknüpften Rundenspielen zu Vorschlägen
// zusammen, die der Admin per Klick als Mannschaft anlegen kann (siehe
// /admin/rundenspiele) — nach normalisiertem Namen UND Kategorie gruppiert,
// damit "Herren I" und "Herren 1" nicht als zwei Vorschläge auftauchen,
// aber z.B. die Herren- und eine Jugendmannschaft desselben Vereins (die
// nuLiga oft ohne unterscheidenden Nummern-Suffix im Namen führt) getrennt
// bleiben. Bewusst nur Heimnamen: der Export enthält alle Spiele an der
// EIGENEN Halle, die eigenen Mannschaften stehen dort also immer als
// Heimmannschaft — der Auswärtsname ist immer ein fremder Verein und wird
// deshalb ignoriert.
export function gruppiereUnbekannteMannschaften(
  eintraege: {
    heimMannschaftName: string | null;
    mannschaftId: string | null;
    kategorie?: string | null;
  }[]
): UnbekannteMannschaft[] {
  const gruppen = new Map<string, UnbekannteMannschaft>();
  for (const e of eintraege) {
    if (e.mannschaftId) continue;
    const roh = e.heimMannschaftName;
    if (roh) {
      const kategorie = e.kategorie ?? null;
      const key = `${normalisiereMannschaftsname(roh)}::${kategorie ?? ""}`;
      const bestehend = gruppen.get(key);
      if (bestehend) bestehend.anzahlSpiele++;
      else
        gruppen.set(key, {
          normalisiert: normalisiereMannschaftsname(roh),
          anzeigeName: roh,
          kategorie,
          anzahlSpiele: 1,
        });
    }
  }
  return [...gruppen.values()].sort((a, b) => b.anzahlSpiele - a.anzahlSpiele);
}
