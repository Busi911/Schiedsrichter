import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a) }));
vi.mock("server-only", () => ({}));

const antwort = (status: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status, headers });

describe("holeFeedText", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    lookup.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("liest den Feed, wenn der Host öffentlich auflöst", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    fetchMock.mockResolvedValue(antwort(200, "<rss/>"));
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://www.hsg-test.de/feed")).resolves.toBe("<rss/>");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("ruft nichts ab, wenn der Name auf eine interne Adresse zeigt", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5" }]);
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://intern.hsg-test.de/feed")).rejects.toThrow(/nicht öffentlich/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lehnt auch ab, wenn nur EINE der Adressen intern ist", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }, { address: "169.254.169.254" }]);
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://gemischt.hsg-test.de/feed")).rejects.toThrow(/nicht öffentlich/);
  });

  it("folgt Weiterleitungen nur auf erlaubte Adressen", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    fetchMock.mockResolvedValueOnce(antwort(302, "", { location: "http://169.254.169.254/latest" }));
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://hsg-test.de/feed")).rejects.toThrow(/nicht erlaubte Adresse/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("folgt einer erlaubten Weiterleitung und prüft auch dort den Host", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34" }]).mockResolvedValueOnce([{ address: "127.0.0.1" }]);
    fetchMock.mockResolvedValueOnce(antwort(301, "", { location: "https://umleitung.hsg-test.de/feed" }));
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://hsg-test.de/feed")).rejects.toThrow(/nicht öffentlich/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bricht nach zu vielen Weiterleitungen ab", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    fetchMock.mockImplementation(async () => antwort(302, "", { location: "https://hsg-test.de/weiter" }));
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://hsg-test.de/feed")).rejects.toThrow(/zu oft/);
  });

  it("begrenzt die Größe und meldet Fehlerstatus allgemein", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    fetchMock.mockResolvedValueOnce(antwort(200, "x".repeat(1_600_000)));
    await expect(holeFeedText("https://hsg-test.de/feed")).rejects.toThrow(/zu groß/);
    fetchMock.mockResolvedValueOnce(antwort(404, "geheim"));
    await expect(holeFeedText("https://hsg-test.de/feed")).rejects.toThrow(/HTTP 404/);
  });

  it("meldet einen unbekannten Host verständlich", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    const { holeFeedText } = await import("./neuigkeiten-abruf");
    await expect(holeFeedText("https://gibt-es-nicht.hsg-test.de/feed")).rejects.toThrow(/nicht gefunden/);
  });
});
