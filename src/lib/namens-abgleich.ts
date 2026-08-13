// Namensabgleich für die öffentliche, login-freie Selbsteintragung (siehe
// /zeitnehmer-eintragen/[token]): wer sich selbst mit Namen eintragen will,
// soll — wenn möglich — automatisch mit einer bereits im Verein angelegten
// Person (Funktionsträger) verknüpft werden, statt immer einen neuen
// externerName-Eintrag zu erzeugen. Bei nicht ganz eindeutiger Übereinstimmung
// gibt es stattdessen einen Vorschlag, den der Wart bestätigen muss (siehe
// zeitnehmerVorschlagBestaetigen in profil/zeitnehmerwart/actions.ts) — kein
// automatisches Matching ohne menschliche Kontrolle bei Unsicherheit.

export type Namenskandidat = {
  userId: string;
  name: string | null;
};

export type Namensabgleich = {
  exakt: Namenskandidat | null;
  vorschlag: Namenskandidat | null;
};

// Ab diesem Anteil übereinstimmender Wörter gilt ein Kandidat als Vorschlag
// (z.B. nur der Vorname eingegeben, oder ein Tippfehler in einem Wort).
const VORSCHLAG_SCHWELLE = 0.5;

// U+0300-U+036F = Unicode "Combining Diacritical Marks" — nach NFD-
// Normalisierung zerfällt z.B. "ü" in "u" + Kombinationszeichen; das Entfernen
// macht den Abgleich unempfindlich gegenüber Umlaut-Schreibweisen.
const DIAKRITIKA_MUSTER = /[\u0300-\u036f]/g;

function normalisiere(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIAKRITIKA_MUSTER, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const zeilen = a.length + 1;
  const spalten = b.length + 1;
  const dp: number[][] = Array.from({ length: zeilen }, () =>
    new Array<number>(spalten).fill(0)
  );
  for (let i = 0; i < zeilen; i++) dp[i][0] = i;
  for (let j = 0; j < spalten; j++) dp[0][j] = j;
  for (let i = 1; i < zeilen; i++) {
    for (let j = 1; j < spalten; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Zwei (bereits normalisierte) Wörter gelten als "gleich", wenn sie exakt
// übereinstimmen oder — bei ausreichender Länge, um Zufallstreffer
// unwahrscheinlich zu machen — höchstens einen Buchstaben Unterschied haben
// (ein einzelner Tippfehler).
function woerterPassenZusammen(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1;
}

// Anteil der eingegebenen Wörter, die in einem Wort des Kandidatennamens
// wiedergefunden werden — funktioniert auch, wenn nur Vor- ODER Nachname
// eingegeben wurde (dann trifft ein einziges Wort zu 100%).
function aehnlichkeit(eingegeben: string, kandidat: string): number {
  const eingegebeneWoerter = eingegeben.split(" ").filter(Boolean);
  if (eingegebeneWoerter.length === 0) return 0;
  const kandidatWoerter = kandidat.split(" ").filter(Boolean);
  const treffer = eingegebeneWoerter.filter((w) =>
    kandidatWoerter.some((k) => woerterPassenZusammen(w, k))
  ).length;
  return treffer / eingegebeneWoerter.length;
}

export function findeNamensVorschlag(
  eingegebenerName: string,
  kandidaten: Namenskandidat[]
): Namensabgleich {
  const norm = normalisiere(eingegebenerName);

  const exakt =
    kandidaten.find((k) => k.name && normalisiere(k.name) === norm) ?? null;
  if (exakt) return { exakt, vorschlag: null };

  let bester: Namenskandidat | null = null;
  let besterScore = 0;
  for (const kandidat of kandidaten) {
    if (!kandidat.name) continue;
    const score = aehnlichkeit(norm, normalisiere(kandidat.name));
    if (score > besterScore) {
      besterScore = score;
      bester = kandidat;
    }
  }

  return {
    exakt: null,
    vorschlag: besterScore >= VORSCHLAG_SCHWELLE ? bester : null,
  };
}
