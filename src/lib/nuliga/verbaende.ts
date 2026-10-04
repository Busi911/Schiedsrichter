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

// nuScoreLive (Live-Ticker): eigene Single-Page-App, getrennt von der nuLiga-Anwendung (Hash-Routen, verifiziert
// vom Betreiber): #/groups/<GROUP_ID> (Staffel) und #/groups/<GROUP_ID>/meetings/<MEETING_ID> (Einzelspiel).
// Eine vorhandene Meeting-ID heißt NICHT, dass das Spiel live ist — der Link führt nur auf die Live-/Statistikseite.
const LIVE_BASIS = "https://hbde-live.liga.nu/nuScoreLive/";
const NUR_ZIFFERN = /^\d+$/;

export function baueLiveStaffelUrl(groupId: string | null): string | null {
  return groupId && NUR_ZIFFERN.test(groupId) ? `${LIVE_BASIS}#/groups/${groupId}` : null;
}

export function baueLiveSpielUrl(groupId: string | null, meetingId: string | null): string | null {
  if (!groupId || !meetingId || !NUR_ZIFFERN.test(groupId) || !NUR_ZIFFERN.test(meetingId)) return null;
  return `${LIVE_BASIS}#/groups/${groupId}/meetings/${meetingId}`;
}

// Gruppen-ID aus dem gespeicherten Spielbericht-Pfad (…&group=<ID>); so braucht die Spielkarte keinen Join.
export function gruppenIdAusBerichtUrl(berichtUrl: string | null): string | null {
  if (!berichtUrl) return null;
  try {
    return new URL(berichtUrl, "https://nuliga.invalid").searchParams.get("group");
  } catch {
    return null;
  }
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
