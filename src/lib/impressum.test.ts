import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

// Helfer: Mock-Response ohne body.getReader, damit ladeSeite response.text() nutzt.
function mockResponse(html: string, ok = true, status = 200) {
  return {
    ok,
    status,
    body: undefined,
    text: async () => html,
    headers: { get: () => null },
  };
}

describe("scrapeImpressum", () => {
  it("findet E-Mail auf der Startseite", async () => {
    const { scrapeImpressum } = await import("./impressum");
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        "<html><body><footer>Kontakt: vorstand@mein-verein.de</footer></body></html>"
      )
    );
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBe("vorstand@mein-verein.de");
    expect(ergebnis.quelle).toBe("homepage");
  });

  it("findet E-Mail auf der Impressum-Seite", async () => {
    const { scrapeImpressum } = await import("./impressum");
    // Startseite: keine E-Mail
    fetchMock.mockResolvedValueOnce(
      mockResponse("<html><body><h1>Willkommen</h1></body></html>")
    );
    // /impressum: E-Mail gefunden (kein info@ — das ist blacklisted)
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        '<html><body><p>Impressum</p><p>Vorstand: Max Müller</p><a href="mailto:vorstand@mein-verein.de">vorstand@mein-verein.de</a></body></html>'
      )
    );
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBe("vorstand@mein-verein.de");
    expect(ergebnis.quelle).toBe("impressum");
  });

  it("gibt null zurück wenn keine E-Mail gefunden", async () => {
    const { scrapeImpressum } = await import("./impressum");
    fetchMock.mockResolvedValue(
      mockResponse("<html><body><p>Willkommen</p></body></html>")
    );
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBeNull();
    expect(ergebnis.fehler).toBeTruthy();
  });

  it("filtert Blacklist-Domains heraus", async () => {
    const { scrapeImpressum } = await import("./impressum");
    fetchMock.mockResolvedValue(
      mockResponse(
        '<html><body><a href="mailto:noreply@example.com">noreply@example.com</a></body></html>'
      )
    );
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBeNull();
  });

  it("wählt die häufigste E-Mail bei mehreren Treffern", async () => {
    const { scrapeImpressum } = await import("./impressum");
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        '<html><body><a href="mailto:vorstand@mein-verein.de">1</a><a href="mailto:vorstand@mein-verein.de">2</a><a href="mailto:vorstand@mein-verein.de">3</a><a href="mailto:andere@mein-verein.de">4</a></body></html>'
      )
    );
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBe("vorstand@mein-verein.de");
  });

  it("geht mit HTTP-Fehlern um", async () => {
    const { scrapeImpressum } = await import("./impressum");
    fetchMock.mockResolvedValue(mockResponse("", false, 404));
    const ergebnis = await scrapeImpressum("https://mein-verein.de");
    expect(ergebnis.email).toBeNull();
    expect(ergebnis.fehler).toBeTruthy();
  });

  it("lehnt ungültige URLs ab", async () => {
    const { scrapeImpressum } = await import("./impressum");
    const ergebnis = await scrapeImpressum("keine-url");
    expect(ergebnis.email).toBeNull();
    expect(ergebnis.fehler).toBe("Ungültige URL");
  });
});
