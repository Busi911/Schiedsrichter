import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("HBL-Rohanalyse", () => {
  it("zählt Marker und findet Daten in Skripten", async () => {
    const { rohAnalyse } = await import("./diagnose");
    const html = readFileSync(path.join(__dirname, "__fixtures__", "teams.html"), "utf8").replace(
      "</body>",
      `<script id="__NUXT_DATA__" type="application/json">[{"team":"THW Kiel","id":"febf038e-3952-11ef-b7c2-af5c55c3771d"}${" ".repeat(2500)}]</script></body>`
    );
    const r = rohAnalyse(html);
    expect(r.zeilen[0]).toContain("/team/: 10×");
    expect(r.zeilen[0]).toContain("__NUXT_DATA__: 1×");
    expect(r.zeilen[1]).toContain("Skript-Tags");
    expect(r.auszuege.map((a) => a.titel).some((t) => t.startsWith("Anfang des größten Skripts"))).toBe(true);
    expect(r.auszuege.some((a) => a.titel.includes("THW Kiel"))).toBe(true);
  });

  it("findet Adressen und API-Pfade in der Seitenkonfiguration", async () => {
    const { rohAnalyse } = await import("./diagnose");
    const html = `<html><body><script>window.__NUXT__={config:{public:{apiBase:"https://api.beispiel.test/v1",logo:"https://x.test/a.png",pfad:"/api/tabelle"}}}${" ".repeat(150)}</script></body></html>`;
    const r = rohAnalyse(html);
    const zeile = r.zeilen.find((z) => z.startsWith("Adressen/API-Pfade")) ?? "";
    expect(zeile).toContain("https://api.beispiel.test/v1");
    expect(zeile).toContain("/api/tabelle");
    expect(zeile).not.toContain("a.png");
    expect(r.zeilen.some((z) => z.includes("apiBase=https://api.beispiel.test/v1"))).toBe(true);
    expect(r.auszuege.some((a) => a.titel.startsWith("Kleines Skript"))).toBe(true);
  });
});
