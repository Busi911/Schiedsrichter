import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/verein/hsg/spiele" }));
vi.mock("@/components/link-spinner", () => ({ LinkSymbol: ({ children }: { children: unknown }) => children }));

describe("VereinsNav", () => {
  it("ohne Training vier Bereiche (Bottom-Bar mit vier Spalten)", async () => {
    const { VereinsNav } = await import("./vereins-nav");
    const html = renderToStaticMarkup(createElement(VereinsNav, { basis: "/verein/hsg" }));
    expect(html).not.toContain("/verein/hsg/training");
    expect(html).toContain("grid-cols-4");
    expect(html).not.toContain("grid-cols-5");
  });
  it("mit Training fünf Bereiche (Bottom-Bar mit fünf Spalten, Tab und Link)", async () => {
    const { VereinsNav } = await import("./vereins-nav");
    const html = renderToStaticMarkup(createElement(VereinsNav, { basis: "/verein/hsg", mitTraining: true }));
    expect(html).toContain('href="/verein/hsg/training"');
    expect(html).toContain("grid-cols-5");
    expect(html.match(/href="\/verein\/hsg\//g)?.length).toBe(8); // 4 Unterseiten (Spiele, Teams, Statistik, Training) in Desktop-Tabs und Bottom-Bar; die Startseite hat keinen Schrägstrich
  });
  it("mit Neuigkeiten allein fünf Bereiche, mit Training UND Neuigkeiten vier plus „Mehr“ (höchstens fünf Plätze unten)", async () => {
    const { VereinsNav } = await import("./vereins-nav");
    const news = renderToStaticMarkup(createElement(VereinsNav, { basis: "/verein/hsg", mitNeuigkeiten: true }));
    expect(news).toContain('href="/verein/hsg/neuigkeiten"');
    expect(news).toContain("grid-cols-5");
    expect(news).not.toContain('href="/verein/hsg/mehr"');

    const beide = renderToStaticMarkup(createElement(VereinsNav, { basis: "/verein/hsg", mitTraining: true, mitNeuigkeiten: true }));
    // Unten: 4 feste + Mehr (Training und Neuigkeiten stehen dort nicht); oben (Desktop-Tabs): alle sechs.
    const unten = beide.slice(beide.indexOf("data-vereins-nav"));
    expect(unten).toContain('href="/verein/hsg/mehr"');
    expect(unten).not.toContain('href="/verein/hsg/training"');
    expect(unten).not.toContain('href="/verein/hsg/neuigkeiten"');
    expect(unten.match(/<li>/g)?.length).toBe(5);
    const oben = beide.slice(0, beide.indexOf("data-vereins-nav"));
    expect(oben).toContain('href="/verein/hsg/training"');
    expect(oben).toContain('href="/verein/hsg/neuigkeiten"');
  });
});
