import { nachfahren, parseHtml, textInhalt } from "./html";
import { findeSpielKopf } from "./match-parser";
import { SportDeLayoutFehler, type LiveEvent, type SportDeLiveStand } from "./types";

// Liveticker-Seite (…/ma<ID>/<teams>/liveticker/): Kopf (Stand, Halbzeitstand, Status, Minute) und Ereignisliste
// ("60' Spielende", "59' Tor für TV Großwallstadt, 31:32 …"). Phase 1: Status, Minute, Stand, Halbzeitstand. Die Ereignisse werden
// klassifiziert, aber OHNE Spielernamen (keine Personendaten) geliefert und nicht gespeichert.

const EREIGNIS = /^(\d{1,3})(?:\+\d{1,2})?\s*['′’]\s+(.{2,300})$/;

export function klassifiziereEreignis(text: string): Pick<LiveEvent, "type" | "team" | "homeScore" | "awayScore"> {
  const t = text.toLowerCase();
  const stand = text.match(/(\d{1,3})\s*:\s*(\d{1,3})/);
  const mitStand = stand ? { homeScore: Number(stand[1]), awayScore: Number(stand[2]) } : {};
  const team = text.match(/(?:Tor|Treffer|Zeitstrafe|2[- ]Minuten(?:-Strafe)?|7[- ]?Meter|Siebenmeter)\s+(?:für|von|gegen)\s+([^,.:]+?)(?:\s*[,.:]|\s+\d+\s*:|$)/i)?.[1]?.trim();
  const mitTeam = team ? { team } : {};
  if (/anpfiff\s*2\.?\s*halbzeit|beginn\s*2\.?\s*halbzeit/.test(t)) return { type: "half_start", ...mitStand };
  if (/anpfiff|spielbeginn/.test(t)) return { type: "match_start" };
  if (/ende\s*1\.?\s*halbzeit|halbzeitpause|halbzeit\b.*ende/.test(t)) return { type: "half_end", ...mitStand };
  if (/spielende|abpfiff|spiel beendet/.test(t)) return { type: "match_end", ...mitStand };
  if (/(7[- ]?meter|siebenmeter|strafwurf)/.test(t)) {
    if (/(verworfen|vergeben|gehalten|pariert|verschossen|parade)/.test(t)) return { type: "seven_meter_missed", ...mitTeam };
    return { type: "seven_meter_goal", ...mitTeam, ...mitStand };
  }
  if (/(rote karte|disqualifikation)/.test(t)) return { type: "red_card", ...mitTeam };
  if (/(2[- ]?minuten|zeitstrafe|zwei minuten)/.test(t)) return { type: "two_minute", ...mitTeam };
  if (/(^tor\b|\btor für\b|\btreffer\b)/.test(t)) return { type: "goal", ...mitTeam, ...mitStand };
  return { type: "other" };
}

export function parseLivetickerHtml(html: string, externalMatchId: string): SportDeLiveStand {
  const wurzel = parseHtml(html);
  const kopf = findeSpielKopf(wurzel);
  if (!kopf) throw new SportDeLayoutFehler("kein Spielkopf (Stand, Status) auf der Liveticker-Seite gefunden");
  const events: LiveEvent[] = [];
  const gesehen = new Set<string>();
  for (const n of nachfahren(wurzel)) {
    if (["script", "style", "head"].includes(n.tag)) continue;
    const text = textInhalt(n);
    if (text.length > 320) continue;
    const m = text.match(EREIGNIS);
    if (!m) continue;
    // nur das innerste Element der Ereigniszeile
    if ([...nachfahren(n)].some((k) => EREIGNIS.test(textInhalt(k)))) continue;
    const key = `${m[1]}|${m[2]}`;
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    events.push({ minute: Number(m[1]), text: m[2].trim(), ...klassifiziereEreignis(m[2]) });
  }
  const z = kopf.zeile;
  // Neueste Ereignisse stehen im Liveticker meist oben: Minute des Kopfes sonst aus dem höchsten Ereignis.
  const minute = z.minute ?? (z.status === "live" && events.length ? Math.max(...events.map((e) => e.minute ?? 0)) : null);
  return {
    externalMatchId,
    status: z.status,
    statusText: z.statusText,
    minute,
    homeScore: z.heimTore,
    awayScore: z.gastTore,
    halftimeHomeScore: z.halbzeitHeim,
    halftimeAwayScore: z.halbzeitGast,
    events,
  };
}
