// Auswertung der Vereins-Ansprache (rein, ohne DB): wie viele Vereine wurden wann angeschrieben?
export type KontaktZeiten = {
  angeschriebenAm: Date | null; // Instagram, von Hand
  anspracheGesendetAm: Date | null; // automatische E-Mail
  followupGesendetAm: Date | null; // Follow-up nach 7 Tagen
  outreachAbgemeldetAm: Date | null; // Abmeldung durch den Empfänger
};

export type OutreachArt = "instagram" | "email" | "followup" | "abgemeldet";
export const OUTREACH_ARTEN: { art: OutreachArt; label: string; feld: keyof KontaktZeiten }[] = [
  { art: "instagram", label: "Instagram (von Hand)", feld: "angeschriebenAm" },
  { art: "email", label: "E-Mail (automatisch)", feld: "anspracheGesendetAm" },
  { art: "followup", label: "Follow-up", feld: "followupGesendetAm" },
  { art: "abgemeldet", label: "Abgemeldet", feld: "outreachAbgemeldetAm" },
];

export type OutreachTag = { tag: string; zahlen: Record<OutreachArt, number>; summe: number };
export type OutreachAuswertung = {
  gesamt: Record<OutreachArt, number>;
  /** Vereine, die auf mindestens einem Weg angeschrieben wurden (ohne Abmeldung gezählt). */
  vereineAngeschrieben: number;
  /** Je Tag (deutsche Zeit, neueste zuerst). */
  tage: OutreachTag[];
};

const leer = (): Record<OutreachArt, number> => ({ instagram: 0, email: 0, followup: 0, abgemeldet: 0 });

/** Kalendertag in deutscher Zeit als "YYYY-MM-DD". */
export function tagDeutsch(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function werteOutreachAus(kontakte: KontaktZeiten[]): OutreachAuswertung {
  const gesamt = leer();
  const proTag = new Map<string, Record<OutreachArt, number>>();
  let vereineAngeschrieben = 0;
  for (const k of kontakte) {
    if (k.angeschriebenAm || k.anspracheGesendetAm || k.followupGesendetAm) vereineAngeschrieben++;
    for (const { art, feld } of OUTREACH_ARTEN) {
      const zeit = k[feld];
      if (!zeit) continue;
      gesamt[art]++;
      const tag = tagDeutsch(zeit);
      const zahlen = proTag.get(tag) ?? leer();
      zahlen[art]++;
      proTag.set(tag, zahlen);
    }
  }
  const tage = [...proTag.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([tag, zahlen]) => ({ tag, zahlen, summe: zahlen.instagram + zahlen.email + zahlen.followup }));
  return { gesamt, vereineAngeschrieben, tage };
}
