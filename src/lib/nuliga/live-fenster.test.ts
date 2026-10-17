import { describe, expect, it } from "vitest";
import { waehleLiveTeilnahmen, type LiveKandidat } from "./live-fenster";

const anwurf = new Date("2026-10-17T14:00:00Z");
const um = (min: number) => new Date(anwurf.getTime() + min * 60_000);
const kand = (x: Partial<LiveKandidat> = {}): LiveKandidat => ({
  teilnahmeId: "t1",
  ligaVereinId: "v1",
  beginn: anwurf,
  meetingId: null,
  spieleSynchronisiertAm: null,
  ...x,
});

describe("waehleLiveTeilnahmen", () => {
  it("Spiel ohne Meeting-ID: von 30 Min vor bis 60 Min nach dem Anwurf", () => {
    expect(waehleLiveTeilnahmen([kand()], um(-31))).toHaveLength(0);
    expect(waehleLiveTeilnahmen([kand()], um(-29))).toHaveLength(1);
    expect(waehleLiveTeilnahmen([kand()], um(59))).toHaveLength(1);
    expect(waehleLiveTeilnahmen([kand()], um(61))).toHaveLength(0);
  });
  it("mit Meeting-ID kein Link-Abruf mehr", () => {
    expect(waehleLiveTeilnahmen([kand({ meetingId: "5" })], um(10))).toHaveLength(0);
  });
  it("Endstand: 75 bis 180 Min nach Anwurf, auch mit Meeting-ID", () => {
    expect(waehleLiveTeilnahmen([kand({ meetingId: "5" })], um(74))).toHaveLength(0);
    expect(waehleLiveTeilnahmen([kand({ meetingId: "5" })], um(80))).toHaveLength(1);
    expect(waehleLiveTeilnahmen([kand({ meetingId: "5" })], um(181))).toHaveLength(0);
  });
  it("Drosselung je Mannschaft: Link alle 4 Min, Endstand alle 14 Min", () => {
    expect(waehleLiveTeilnahmen([kand({ spieleSynchronisiertAm: um(8) })], um(10))).toHaveLength(0);
    expect(waehleLiveTeilnahmen([kand({ spieleSynchronisiertAm: um(5) })], um(10))).toHaveLength(1);
    const mitId = { meetingId: "5" };
    expect(waehleLiveTeilnahmen([kand({ ...mitId, spieleSynchronisiertAm: um(70) })], um(80))).toHaveLength(0);
    expect(waehleLiveTeilnahmen([kand({ ...mitId, spieleSynchronisiertAm: um(60) })], um(80))).toHaveLength(1);
  });
  it("eine Mannschaft mit zwei Spielen im Fenster nur einmal", () => {
    expect(waehleLiveTeilnahmen([kand(), kand({ beginn: um(-20) })], um(0))).toHaveLength(1);
  });
});
