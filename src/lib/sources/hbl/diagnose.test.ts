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
    expect(r.zeilen[0]).toContain("/team/: 9×");
    expect(r.zeilen[0]).toContain("__NUXT_DATA__: 1×");
    expect(r.zeilen[1]).toContain("Skript-Tags");
    expect(r.auszuege.map((a) => a.titel).some((t) => t.startsWith("Anfang des größten Skripts"))).toBe(true);
    expect(r.auszuege.some((a) => a.titel.includes("THW Kiel"))).toBe(true);
  });
});
