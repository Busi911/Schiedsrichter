// nuLiga-Instanzen je Landesverband. Aktuell nur der HHV (der bereits
// getestete Anbieter, siehe src/lib/nuliga-scraper.ts) — weitere Verbände
// brauchen nur einen zusätzlichen Eintrag (Domain + WebObjects-App-Pfad;
// der Pfad "nuLigaHBDE" ist der Handball-Mandant aller *.liga.nu-Verbände).
export type Verband = {
  schluessel: string;
  domain: string;
  appPfad: string;
};

export const VERBAENDE: Record<string, Verband> = {
  HHV: {
    schluessel: "HHV",
    domain: "hhv-handball.liga.nu",
    appPfad: "/cgi-bin/WebObjects/nuLigaHBDE.woa/wa",
  },
};

export function holeVerband(schluessel: string): Verband {
  const v = VERBAENDE[schluessel];
  if (!v) throw new Error(`Unbekannter nuLiga-Verband "${schluessel}"`);
  return v;
}

// Öffentlicher Spielbericht-Link: der von nuLiga selbst gelieferte Pfad (Spielplan-Link) plus Domain des
// Verbands. Nur nuLiga-Pfade, nur https, nie eine fremde Domain.
export function baueBerichtUrl(verband: string, berichtUrl: string | null): string | null {
  if (!berichtUrl || !berichtUrl.startsWith("/") || berichtUrl.startsWith("//")) return null;
  const v = VERBAENDE[verband];
  if (!v || !/MeetingReport\?/i.test(berichtUrl)) return null;
  return `https://${v.domain}${berichtUrl}`;
}

export function baueNuligaUrl(
  verband: string,
  seite: "clubTeams" | "groupPage" | "teamPortrait",
  params: Record<string, string>
): string {
  const v = holeVerband(verband);
  const query = new URLSearchParams(params).toString();
  return `https://${v.domain}${v.appPfad}/${seite}?${query}`;
}
