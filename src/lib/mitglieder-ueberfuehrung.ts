// Überführung der Funktionsträger in die Mitgliederliste (Add-on Vereinsverwaltung) samt Duplikatprüfung. Rein, ohne Datenbank.
// Funktionsträger funktionieren auch ohne Vereinsverwaltung; erst mit dem Add-on werden sie als Mitglieder geführt.

export type KontoPerson = { userId: string; name: string | null; email: string; telefon: string | null; aktiv: boolean };
export type MitgliedKurz = { id: string; name: string; vorname: string; email: string | null; userId: string | null; geburtsdatum?: string | null };

const NAMENSZUSAETZE = new Set(["von", "van", "vom", "zu", "zur", "zum", "de", "der", "den", "da", "di", "du", "le", "la", "ter", "ten", "dos", "do"]);

/** "Max Muster" -> Vorname Max, Nachname Muster; "Anna von der Heide" -> Anna / von der Heide; "Muster, Max" -> Max / Muster. Einzelnes Wort: null. */
export function teileName(voll: string | null): { vorname: string; name: string } | null {
  const text = (voll ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (text.includes(",")) {
    const [nach, vor] = text.split(",", 2).map((t) => t.trim());
    return nach && vor ? { vorname: vor, name: nach } : null;
  }
  const teile = text.split(" ");
  if (teile.length < 2) return null;
  let start = teile.length - 1;
  while (start > 1 && NAMENSZUSAETZE.has(teile[start - 1].toLowerCase())) start--;
  return { vorname: teile.slice(0, start).join(" "), name: teile.slice(start).join(" ") };
}

export function normalisiereName(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "");
}

const mailSchluessel = (m: string | null | undefined) => (m ?? "").trim().toLowerCase();
const namensSchluessel = (vorname: string, name: string) => `${normalisiereName(vorname)}|${normalisiereName(name)}`;

export type Treffer =
  | { art: "bereits"; mitglied: MitgliedKurz }
  | { art: "verknuepfen"; mitglied: MitgliedKurz; grund: "email" | "name" }
  | { art: "pruefen"; mitglied: MitgliedKurz; grund: string };

/**
 * Sucht zu einer Person (Konto oder Eingabe) ein vorhandenes Mitglied.
 * - gleiches Konto: bereits übernommen; - gleiche E-Mail: dieselbe Person; - gleicher Name ohne Widerspruch (Mitglied ohne Adresse, noch nicht verknüpft): dieselbe Person;
 * - gleicher Name, aber andere Adresse oder anderes Konto: kann dieselbe Person sein oder nicht -> nichts anlegen, nachfragen.
 */
export function findeMitglied(
  p: { userId?: string | null; vorname: string; name: string; email: string | null; geburtsdatum?: string | null },
  mitglieder: MitgliedKurz[]
): Treffer | null {
  if (p.userId) {
    const konto = mitglieder.find((m) => m.userId === p.userId);
    if (konto) return { art: "bereits", mitglied: konto };
  }
  const mail = mailSchluessel(p.email);
  if (mail) {
    const gleicheMail = mitglieder.find((m) => mailSchluessel(m.email) === mail);
    if (gleicheMail) {
      return gleicheMail.userId && p.userId && gleicheMail.userId !== p.userId
        ? { art: "pruefen", mitglied: gleicheMail, grund: "Gleiche E-Mail-Adresse, aber mit einem anderen Konto verknüpft." }
        : { art: "verknuepfen", mitglied: gleicheMail, grund: "email" };
    }
  }
  const schluessel = namensSchluessel(p.vorname, p.name);
  const gleicherName = mitglieder.filter(
    (m) => namensSchluessel(m.vorname, m.name) === schluessel && !(p.geburtsdatum && m.geburtsdatum && p.geburtsdatum !== m.geburtsdatum)
  );
  const treffer = gleicherName[0];
  if (!treffer) return null;
  if (treffer.userId && p.userId && treffer.userId !== p.userId) {
    return { art: "pruefen", mitglied: treffer, grund: "Gleicher Name, aber bereits mit einem anderen Konto verknüpft." };
  }
  if (mailSchluessel(treffer.email) && mail && mailSchluessel(treffer.email) !== mail) {
    return { art: "pruefen", mitglied: treffer, grund: "Gleicher Name, aber andere E-Mail-Adresse." };
  }
  return { art: "verknuepfen", mitglied: treffer, grund: "name" };
}

export type UeberfuehrungPlan = {
  neu: { person: KontoPerson; vorname: string; name: string }[];
  verknuepfen: { userId: string; mitgliedId: string; grund: "email" | "name" }[];
  pruefen: { person: KontoPerson; mitglied: MitgliedKurz; grund: string }[];
  unvollstaendig: KontoPerson[];
  bereits: number;
};

export function planeUeberfuehrung(personen: KontoPerson[], mitglieder: MitgliedKurz[]): UeberfuehrungPlan {
  const plan: UeberfuehrungPlan = { neu: [], verknuepfen: [], pruefen: [], unvollstaendig: [], bereits: 0 };
  // Arbeitskopie: schon verknüpfte oder neu geplante Mitglieder zählen für die folgenden Personen mit (zwei Konten mit gleichem Namen ergeben keine zwei Mitglieder).
  const pool: MitgliedKurz[] = mitglieder.map((m) => ({ ...m }));
  for (const person of personen) {
    const namen = teileName(person.name);
    if (!namen) {
      // Konto schon verknüpft? Dann ist es kein Problem.
      if (pool.some((m) => m.userId === person.userId)) plan.bereits++;
      else plan.unvollstaendig.push(person);
      continue;
    }
    const treffer = findeMitglied({ userId: person.userId, ...namen, email: person.email }, pool);
    if (!treffer) {
      plan.neu.push({ person, ...namen });
      pool.push({ id: `neu:${person.userId}`, ...namen, email: person.email, userId: person.userId });
    } else if (treffer.art === "bereits") plan.bereits++;
    else if (treffer.art === "verknuepfen") {
      plan.verknuepfen.push({ userId: person.userId, mitgliedId: treffer.mitglied.id, grund: treffer.grund });
      const im = pool.find((m) => m.id === treffer.mitglied.id);
      if (im) im.userId = person.userId;
    } else plan.pruefen.push({ person, mitglied: treffer.mitglied, grund: treffer.grund });
  }
  return plan;
}

/** Wie viele Personen noch etwas zu tun haben (neu, zu verknüpfen oder zu prüfen). */
export function offeneUeberfuehrung(plan: UeberfuehrungPlan): number {
  return plan.neu.length + plan.verknuepfen.length + plan.pruefen.length + plan.unvollstaendig.length;
}
