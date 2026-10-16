import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Rendert die Startseite und die Brotkrumen serverseitig (wie sie ausgeliefert werden) und prüft, was Suchmaschinen im HTML sehen.
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); }, usePathname: () => "/" }));
vi.mock("@/lib/liga-oeffentlich", () => ({
  holeAlleVereine: async () => [
    { id: "1", name: "HSG Linden", slug: "hsg-linden", logoAktualisiertAm: null },
    { id: "2", name: "TSG Leihgestern", slug: "tsg-leihgestern", logoAktualisiertAm: null },
  ],
}));
vi.mock("@/lib/system-einstellungen", () => ({ holeBetaStand: async () => ({ frei: 3, voll: false }) }));

beforeAll(() => {
  process.env.APP_URL = "https://www.handballerpate.example";
});

describe("Startseite (ausgeliefertes HTML)", () => {
  it("hat genau eine H1 mit dem Nutzen, die Vereinssuche und crawlbare Vereinslinks", async () => {
    const { default: Home } = await import("./page");
    const html = renderToStaticMarkup(await Home());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("Dein Handballverein. Alle Mannschaften im Blick.");
    expect(html).toContain('aria-label="Verein suchen"');
    expect(html).toContain('href="/verein/hsg-linden"');
    expect(html).toContain('href="/verein/tsg-leihgestern"');
    expect(html).toContain('href="/verein"');
    // Die Suche steht vor der Vereins-Werbung (erster Bildschirm gehört den Fans).
    expect(html.indexOf('aria-label="Verein suchen"')).toBeLessThan(html.indexOf("Verein kostenlos registrieren"));
  });
  it("enthält keine unbelegten Versprechen", async () => {
    const { default: Home } = await import("./page");
    const html = renderToStaticMarkup(await Home());
    expect(html).not.toMatch(/immer live|Live-Ticker eures Vereins|alle Vereine (sind|deutschlands)/i);
    expect(html).toContain("kein offizielles Angebot der Verbände");
  });
  it("JSON-LD ist gültig und enthält Organization, WebSite und FAQPage", async () => {
    const { default: Home } = await import("./page");
    const html = renderToStaticMarkup(await Home());
    const roh = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const daten = JSON.parse(roh.replace(/\\u003c/g, "<"));
    expect(daten["@graph"].map((e: { "@type": string }) => e["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  });
});

describe("Brotkrumen", () => {
  it("sichtbare Links, aktuelle Seite ohne Link, BreadcrumbList mit absoluten URLs", async () => {
    const { Brotkrumen } = await import("@/components/liga/brotkrumen");
    const html = renderToStaticMarkup(
      createElement(Brotkrumen, {
        kette: [
          { name: "Vereine", href: "/verein" },
          { name: "HSG Linden", href: "/verein/hsg-linden" },
        ],
      }),
    );
    expect(html).toContain('<a class="');
    expect(html).toContain('href="/verein"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("https://www.handballerpate.example/verein/hsg-linden");
    expect(html).toContain("BreadcrumbList");
  });
});

describe("robots.txt", () => {
  it("sperrt die zeitlich begrenzten Vorschau-Links, lässt die öffentlichen Vereinsseiten offen", async () => {
    const { default: robots } = await import("./robots");
    const regel = [robots().rules].flat()[0];
    expect(regel.disallow).toContain("/verein/*/vorschau/");
    expect(regel.allow).toContain("/verein/");
  });
});
