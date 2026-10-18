import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { beitragsklassen, beitrittAntraege, mitgliedMannschaften, mitglieder, vereine } from "./schema";

// Smoke-Test ohne Datenbank: Tabellendefinitionen und RLS in der Migration 0117 (Vereinsverwaltung, Phase 1).
const sql = readFileSync(join(__dirname, "migrations/0117_vereinsverwaltung.sql"), "utf8");

describe("Vereinsverwaltung: Schema", () => {
  it("Tabellennamen sind singular", () => {
    expect(getTableName(mitglieder)).toBe("mitglied");
    expect(getTableName(mitgliedMannschaften)).toBe("mitglied_mannschaft");
    expect(getTableName(beitrittAntraege)).toBe("beitritt_antrag");
    expect(getTableName(beitragsklassen)).toBe("beitragsklasse");
  });

  it("Spalten (snake_case) und Pflichtfelder", () => {
    const m = getTableColumns(mitglieder);
    expect(m.vereinId.name).toBe("verein_id");
    expect(m.vereinId.notNull).toBe(true);
    expect(m.name.notNull && m.vorname.notNull).toBe(true);
    expect(m.status.default).toBe("aktiv");
    expect(getTableColumns(mitgliedMannschaften).rolle.default).toBe("spieler");
    expect(getTableColumns(beitrittAntraege).email.notNull).toBe(true);
    expect(getTableColumns(beitrittAntraege).status.default).toBe("offen");
    expect(getTableColumns(beitragsklassen).betrag.notNull).toBe(true);
  });

  it("vereine.vereinsverwaltungAktiv ist standardmäßig aus", () => {
    const c = getTableColumns(vereine).vereinsverwaltungAktiv;
    expect(c.name).toBe("vereinsverwaltung_aktiv");
    expect(c.default).toBe(false);
    expect(c.notNull).toBe(true);
  });
});

describe("Vereinsverwaltung: Migration 0117", () => {
  it("ist wiederholbar (IF NOT EXISTS)", () => {
    expect(sql).not.toMatch(/CREATE TABLE "/);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "vereinsverwaltung_aktiv"');
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX "/);
  });

  it.each(["mitglied", "mitglied_mannschaft", "beitritt_antrag", "beitragsklasse"])("%s: RLS aktiv und erzwungen, mit Policy", (t) => {
    expect(sql).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
    expect(sql).toContain(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
    expect(sql).toMatch(new RegExp(`CREATE POLICY \\w+ ON "${t}"`));
  });

  it("mitglied_mannschaft prüft indirekt über mitglied.verein_id", () => {
    const policy = sql.split('CREATE POLICY tenant_isolation ON "mitglied_mannschaft"')[1].split("--> statement-breakpoint")[0];
    expect(policy).toContain("FROM mitglied m");
    expect(policy).toContain("m.verein_id = current_setting('app.current_verein_id', true)::uuid");
  });

  it("beitritt_antrag: Lesen nur eigener Verein, Anlegen ohne Login", () => {
    expect(sql).toMatch(/CREATE POLICY tenant_select ON "beitritt_antrag" FOR SELECT\s+USING \(verein_id = current_setting/);
    expect(sql).toMatch(/CREATE POLICY public_insert ON "beitritt_antrag" FOR INSERT\s+WITH CHECK \(true\)/);
  });
});
