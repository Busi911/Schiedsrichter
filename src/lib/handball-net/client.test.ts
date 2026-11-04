import { describe, expect, it, vi } from "vitest";
import { erstelleHandballNetClient } from "./client";

const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});
const seite = () => new Response('<html><meta content="public-session-token" name="client-token"></html>', {
  headers: { "set-cookie": "session=test-cookie; Path=/; HttpOnly; Secure" },
});
const client = (responses: Response[]) => {
  const laden = vi.fn<typeof fetch>();
  for (const response of responses) laden.mockResolvedValueOnce(response);
  const warte = vi.fn(async () => {});
  return { hole: erstelleHandballNetClient({ fetch: laden, minAbstandMs: 0, warte }), laden, warte };
};

describe("handball.net Website-Sitzung", () => {
  it("liest frischen Token und Sitzungscookie und verwendet beide für mehrere API-Aufrufe", async () => {
    const { hole, laden } = client([seite(), json({ data: [1] }), json({ data: [2] })]);
    await expect(hole("/api/new/seasons")).resolves.toEqual({ data: [1] });
    await hole("/api/new/teams/1");
    expect(laden).toHaveBeenCalledTimes(3);
    expect(laden.mock.calls[0][1]).toMatchObject({ cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    expect(laden.mock.calls[1][1]).toMatchObject({ headers: {
      "x-client-token": "public-session-token", Cookie: "session=test-cookie",
      "User-Agent": "HandballerPate/1.0 (+https://handballerpate.de/)",
    }, redirect: "error" });
  });

  it("erneuert eine ausdrücklich abgelaufene Sitzung höchstens einmal", async () => {
    const { hole, laden } = client([seite(), json({ code: "CLIENT_TOKEN_EXPIRED" }, 403), seite(), json({ code: "CLIENT_TOKEN_EXPIRED" }, 403)]);
    await expect(hole("/api/new/seasons")).rejects.toThrow("HTTP 403");
    expect(laden).toHaveBeenCalledTimes(4);
  });

  it("wiederholt eine allgemeine Sperre nicht und gibt keine Bodies oder Tokens aus", async () => {
    const { hole, laden } = client([seite(), json({ error: "secret-person" }, 403, { "cf-ray": "request-123" })]);
    await expect(hole("/api/new/seasons")).rejects.toThrow("HTTP 403; Request-ID request-123");
    expect(laden).toHaveBeenCalledTimes(2);
  });

  it("respektiert Retry-After und bricht lange Sperrfristen ohne frühen Retry ab", async () => {
    const { hole, warte } = client([seite(), json({}, 429, { "retry-after": "7" }), json({ data: [] })]);
    await hole("/api/new/seasons");
    expect(warte).toHaveBeenCalledWith(7000);
    const lang = client([seite(), json({}, 429, { "retry-after": "300" })]);
    await expect(lang.hole("/api/new/seasons")).rejects.toThrow("HTTP 429");
    expect(lang.laden).toHaveBeenCalledTimes(2);
  });

  it("erkennt HTML mit HTTP 200 als Formatfehler", async () => {
    const { hole } = client([seite(), new Response("Wartung", { headers: { "content-type": "text/html" } })]);
    await expect(hole("/api/new/seasons")).rejects.toThrow("ohne gültiges JSON");
  });

  it("führt gleichzeitige Aufrufe nacheinander aus und bleibt nach Fehlern benutzbar", async () => {
    let aktiv = 0;
    let maximum = 0;
    let aufruf = 0;
    const laden = vi.fn<typeof fetch>(async () => {
      maximum = Math.max(maximum, ++aktiv);
      await Promise.resolve();
      aktiv--;
      return aufruf++ === 0 ? seite() : aufruf === 2 ? json({}, 403) : json({ data: [] });
    });
    const hole = erstelleHandballNetClient({ fetch: laden, minAbstandMs: 0 });
    const ergebnis = await Promise.allSettled([hole("/api/new/seasons"), hole("/api/new/teams/1")]);
    expect(ergebnis.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
    expect(maximum).toBe(1);
  });

  it("bricht bei fehlendem Token oder fremdem Pfad ohne API-Abruf ab", async () => {
    const c = client([new Response("Startseite")]);
    await expect(c.hole("https://example.org/")).rejects.toThrow("ungültiger API-Pfad");
    expect(c.laden).not.toHaveBeenCalled();
    await expect(c.hole("/api/new/seasons")).rejects.toThrow("ohne Client-Token");
    expect(c.laden).toHaveBeenCalledTimes(1);
  });
});
