import { describe, expect, it } from "vitest";
import { handballNetSpielUrl, saisonAusSpielcode } from "./ticker-link";
import { quelleFuer } from "../match-provider";
import type { SpielAnsicht } from "../liga-spiele-hilfen";

// Historische Verifikation (17.10.2026, im Browser geprüft): JSG Balingen-Weilstetten – HSG Dutenhofen/Münchholzhausen, Jugendbundesliga
// A-Jugend männlich 1. Liga Süd. Es werden nur IDs/URL-Aufbau geprüft, keine Live-Daten.
const BALINGEN = { externeId: "392196", spielcode: "2627DHBJBLAJMB0504" };

describe("handballNetSpielUrl", () => {
  it("Beispielspiel 392196 -> Spielseite mit Saison 2627", () => {
    expect(handballNetSpielUrl(BALINGEN.externeId, BALINGEN.spielcode)).toBe("https://www.handball.net/match/392196?season_id=2627");
  });
  it("Saison aus der Spielnummer, sonst kein Parameter", () => {
    expect(saisonAusSpielcode("2627DHB3LERMC0701")).toBe("2627");
    expect(saisonAusSpielcode("9912XYZ")).toBeNull();
    expect(saisonAusSpielcode("2025DHB")).toBeNull();
    expect(saisonAusSpielcode(null)).toBeNull();
    expect(handballNetSpielUrl("392196", null)).toBe("https://www.handball.net/match/392196");
  });
  it("ohne (oder mit unsinniger) Spiel-ID kein Link", () => {
    expect(handballNetSpielUrl(null, BALINGEN.spielcode)).toBeNull();
    expect(handballNetSpielUrl("../x", BALINGEN.spielcode)).toBeNull();
  });
});

describe("Quellen-Zuordnung der Spielkarte", () => {
  const spiel = (x: Partial<SpielAnsicht>) => ({ status: "geplant", ...x }) as SpielAnsicht;
  it("handball.net-Spiel bekommt den Spielseiten-Link, nuLiga-Spiele bleiben unverändert", () => {
    const h = spiel({ quelle: "handball_net", ...BALINGEN });
    expect(quelleFuer(h).liveUrl(h)).toBe("https://www.handball.net/match/392196?season_id=2627");
    // Nach dem Spiel: dieselbe Spielseite, beschriftet als Spielseite (kein "Spielbericht": ein offizieller Bericht ist nicht belegt)
    expect(quelleFuer(h).berichtUrl(h)).toBe("https://www.handball.net/match/392196?season_id=2627");
    expect(quelleFuer(h).berichtLabel).toBe("Spielseite bei handball.net");
    const n = spiel({ quelle: "nuliga", meetingId: "8263197", berichtUrl: "/cgi-bin/WebObjects/nuLigaHBDE.woa/wa/groupMeetingReport?meeting=8263197&group=493253" });
    expect(quelleFuer(n).liveUrl(n)).toBe("https://hbde-live.liga.nu/nuScoreLive/#/groups/493253/meetings/8263197");
  });
  it("abgeschlossenes Spiel 392192 (HC Erlangen – HSG Dutenhofen/Münchholzhausen, 32:34, historischer Fall) -> Spielseite mit Saison 2627", () => {
    const h = spiel({ quelle: "handball_net", externeId: "392192", spielcode: "2627DHBJBLAJMB0405", toreHeim: 32, toreGast: 34, ergebnisBestaetigt: true });
    expect(quelleFuer(h).berichtUrl(h)).toBe("https://www.handball.net/match/392192?season_id=2627");
  });
  it("Fall ohne Spiel-ID (abgeschlossen, ohne Link): kein Link statt eines geratenen", () => {
    const h = spiel({ quelle: "handball_net", externeId: null, spielcode: "2627DHBJBLAJMB0405", toreHeim: 20, toreGast: 18 });
    expect(quelleFuer(h).berichtUrl(h)).toBeNull();
    expect(quelleFuer(h).liveUrl(h)).toBeNull();
  });
  it("ein nuLiga-Spiel mit externer ID bekommt nie einen handball.net-Link", () => {
    const n = spiel({ quelle: "nuliga", ...BALINGEN });
    expect(quelleFuer(n).liveUrl(n)).toBeNull();
  });
  it("NDR bleibt unverändert", () => {
    const d = spiel({ quelle: "ndr", berichtUrl: "/sport/ergebnisse/spielstatistik-1234.html" });
    expect(quelleFuer(d).liveUrl(d)).toBe("https://www.ndr.de/sport/ergebnisse/spielstatistik-1234.html");
  });
});
