import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ hole: vi.fn(), parse: vi.fn(), loesche: vi.fn(async () => 0), importiere: vi.fn(async () => ({ neu: 0, aktualisiert: 0, aenderungen: [], terminIds: [], entfernteZuordnungen: [] })) }));
vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("./sync-berechtigung", () => ({}));
vi.mock("./rundenspiel-import", () => ({ parseRundenspielJson: m.parse, findeMannschaft: vi.fn() }));
vi.mock("./rundenspiel-sync", () => ({ importiereRundenspielEreignisse: m.importiere, entferneVerwaisteRundenspiele: m.loesche }));
vi.mock("./handball-net-scraper", () => ({ holeHandballNetJson: m.hole }));
vi.mock("./handball-net-zuordnung", () => ({ ordneHandballNetBesetzungZu: vi.fn() }));
vi.mock("./rundenspiel-benachrichtigung", () => ({}));
vi.mock("./duplikat-benachrichtigung", () => ({}));
import { synchronisiereHandballNetMannschaften } from "./handball-net-sync";

beforeEach(() => { vi.clearAllMocks(); m.parse.mockReturnValue({ ereignisse: [], fehler: [] }); });
const teams = [{ id: "local-a", handballNetTeamId: "a" }, { id: "local-b", handballNetTeamId: "b" }];
it("schützt Termine fehlgeschlagener Teams, während erfolgreiche Teams abgeglichen werden", async () => {
  m.hole.mockResolvedValue({ json: "[]", fehler: [{ teamId: "b", grund: "HTTP 403" }], diagnose: [{ teamId: "a" }] });
  await synchronisiereHandballNetMannschaften("verein", teams);
  expect(m.loesche).toHaveBeenCalledWith("verein", ["a"], new Set());
});
it("gibt bei komplettem Abruffehler keine Team-ID für Löschungen frei", async () => {
  m.hole.mockResolvedValue({ json: "[]", fehler: [{ teamId: "a", grund: "HTTP 403" }], diagnose: [] });
  await synchronisiereHandballNetMannschaften("verein", teams);
  expect(m.loesche).toHaveBeenCalledWith("verein", [], new Set());
});
it("gibt bei nachgelagerten Parsefehlern keine Team-ID für Löschungen frei", async () => {
  m.hole.mockResolvedValue({ json: "[]", fehler: [], diagnose: [{ teamId: "a" }] });
  m.parse.mockReturnValue({ ereignisse: [], fehler: [{ index: 0, grund: "Datum fehlt" }] });
  await synchronisiereHandballNetMannschaften("verein", teams);
  expect(m.loesche).toHaveBeenCalledWith("verein", [], new Set());
});
