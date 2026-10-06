import { describe, expect, it, vi, afterEach } from "vitest";
import { beschreibeFormat, beschreibeNichtBild, contentTypeKannBildSein, erkenneBildtyp, maskierePersonendaten } from "./bildtyp";

vi.mock("server-only", () => ({}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Buffer.from("GIF89a....");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);

describe("erkenneBildtyp (Magic Bytes)", () => {
  it("erkennt PNG, JPEG, GIF und WebP an den ersten Bytes", () => {
    expect(erkenneBildtyp(PNG)).toMatchObject({ format: "png", mime: "image/png", endung: "png" });
    expect(erkenneBildtyp(JPEG)).toMatchObject({ format: "jpeg", endung: "jpg" });
    expect(erkenneBildtyp(GIF)).toMatchObject({ format: "gif" });
    expect(erkenneBildtyp(WEBP)).toMatchObject({ format: "webp" });
  });
  it("lehnt alles andere ab (HTML, SVG, RIFF ohne WEBP, zu kurz)", () => {
    for (const x of [Buffer.from("<html>"), Buffer.from("<svg xmlns="), Buffer.from("RIFF1234WAVEfmt "), Buffer.from([0x89, 0x50]), Buffer.alloc(0)]) {
      expect(erkenneBildtyp(x)).toBeNull();
    }
  });
});

describe("contentTypeKannBildSein", () => {
  it("lässt Bildtypen und generische Typen zu, nicht HTML/JSON/SVG", () => {
    for (const ok of ["image/png", "image/jpeg; charset=x", "image/webp", "image/gif", "application/octet-stream", ""]) expect(contentTypeKannBildSein(ok)).toBe(true);
    for (const nein of ["text/html", "application/json", "image/svg+xml"]) expect(contentTypeKannBildSein(nein)).toBe(false);
  });
});

describe("Fehlerbeschreibung statt 'unbekanntes Format'", () => {
  it("nennt HTML beim Namen (mit Titel), erkennt SVG und maskiert Personendaten", () => {
    const html = Buffer.from("<!DOCTYPE html><html><head><title>Sitzung abgelaufen</title></head>");
    expect(beschreibeNichtBild(html, "text/html")).toBe("Logo-URL liefert HTML statt Bild (Titel: Sitzung abgelaufen)");
    expect(beschreibeNichtBild(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml")).toContain("SVG");
    expect(beschreibeFormat(Buffer.from("<svg viewBox='0 0 1 1'/>"))).toContain("svg");
    expect(beschreibeFormat(Buffer.from("HTTP/1.1 302 Found"))).toContain("HTTP");
    expect(beschreibeNichtBild(Buffer.from([1, 2, 3]), "")).toContain("Kein erlaubtes Bildformat");
    expect(maskierePersonendaten("mail a.b@c.de, Tel 0641 123456, 14175")).toBe("mail [mail], Tel [tel], 14175");
  });
});

describe("holeNuligaBild (Download)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const URL_OK = "https://hhv-handball.liga.nu/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=1";
  const antwort = (daten: Buffer, contentType: string, status = 200, extra: Record<string, string> = {}) =>
    new Response(new Uint8Array(daten), { status, headers: { "content-type": contentType, ...extra } });
  const lade = async () => {
    process.env.NULIGA_MIN_ABSTAND_MS = "0";
    vi.resetModules();
    return (await import("./nuliga/client")).holeNuligaBild;
  };

  it("sendet mit Seitenkontext Cookies und Referer, bleibt aber beim ehrlichen User-Agent", async () => {
    let gesehen: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_u: string, init: { headers: Record<string, string> }) => {
      gesehen = init.headers;
      return antwort(PNG, "image/png");
    });
    const kontext = { cookie: "nusportingress=a; routeid_nuligahbde=b", referer: "https://hhv-handball.liga.nu/cgi-bin/WebObjects/nuLigaHBDE.woa/wa/clubInfoDisplay?club=76446" };
    await (await lade())(URL_OK, kontext);
    expect(gesehen.Cookie).toBe(kontext.cookie);
    expect(gesehen.Referer).toBe(kontext.referer);
    expect(gesehen["User-Agent"]).toContain("Handballerpate");
    expect(gesehen.Accept).toContain("image/svg+xml");
    // ohne Kontext: weder Cookie noch Referer
    await (await lade())(URL_OK);
    expect(gesehen.Cookie).toBeUndefined();
    expect(gesehen.Referer).toBeUndefined();
  });
  it("meldet 0 Bytes ohne Content-Type verständlich (so antwortete nuLiga ohne Cookies)", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(0), { status: 200 }));
    await expect((await lade())(URL_OK)).rejects.toThrow("0 Bytes");
  });
  it("akzeptiert application/octet-stream, wenn die Magic Bytes ein Bild belegen", async () => {
    vi.stubGlobal("fetch", async () => antwort(PNG, "application/octet-stream"));
    const r = await (await lade())(URL_OK);
    expect(r.mime).toBe("image/png");
  });
  it("nimmt die Magic Bytes, wenn der Content-Type etwas anderes behauptet", async () => {
    vi.stubGlobal("fetch", async () => antwort(JPEG, "image/png"));
    expect((await (await lade())(URL_OK)).mime).toBe("image/jpeg");
  });
  it("meldet 'liefert HTML statt Bild', wenn die Antwort eine Seite ist", async () => {
    vi.stubGlobal("fetch", async () => antwort(Buffer.from("<html><head><title>Fehler</title></head></html>"), "image/png"));
    await expect((await lade())(URL_OK)).rejects.toThrow("Logo-URL liefert HTML statt Bild (Titel: Fehler)");
  });
  it("lehnt HTML (auch als image/png getarnt) und falsche Hosts ab", async () => {
    const holeBild = await lade();
    vi.stubGlobal("fetch", async () => antwort(Buffer.from("<html>Login</html>"), "text/html"));
    await expect(holeBild(URL_OK)).rejects.toThrow("Kein Bild");
    vi.stubGlobal("fetch", async () => antwort(Buffer.from("<html>Login</html>"), "image/png"));
    await expect(holeBild(URL_OK)).rejects.toThrow("HTML statt Bild");
    await expect(holeBild("https://evil.example/x/wr?wodata=1")).rejects.toThrow("nicht erlaubt");
  });
  it("folgt Weiterleitungen nur auf freigegebene Adressen", async () => {
    vi.stubGlobal("fetch", async () => antwort(Buffer.alloc(0), "text/plain", 302, { location: "https://evil.example/x/wr?wodata=1" }));
    await expect((await lade())(URL_OK)).rejects.toThrow("nicht erlaubt");
  });
  it("bricht zu große Bilder ab", async () => {
    vi.stubGlobal("fetch", async () => antwort(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), "image/png"));
    await expect((await lade())(URL_OK)).rejects.toThrow("zu groß");
  });
});
