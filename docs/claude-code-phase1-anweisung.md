Lies `docs/claude-code-aufgabe-vereinsverwaltung.md` und setze Phase 1 (Datenmodell und Migration) um. Arbeit im Verzeichnis `/opt/data/schiedsrichter`.

Bevor du beginnst:
1. Lese `CLAUDE.md` fuer Projektkonventionen.
2. Lise `src/db/schema.ts` fuer bestehende Tabellen und RLS-Patterns.
3. Lise `src/lib/abrechnung.ts` und `src/lib/beta-konditionen.ts` fuer das Preismodell.

## Phase 1: Datenmodell und Migration

### 1. Schema in src/db/schema.ts — 4 neue Tabellen

Tabelle `mitglied` (Drizzle: `mitglieder`, SQL: `mitglied`):
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- vorname: text, notNull
- geburtsdatum: date, nullable
- email: text, nullable
- telefon: text, nullable
- geschlecht: text, nullable (Werte: "m", "w", "divers")
- status: text, notNull, default "aktiv" (Werte: "aktiv", "passiv", "ausgetreten")
- eintrittsdatum: date, default now
- austrittsdatum: date, nullable
- bemerkung: text, nullable
- erstelltAm: timestamp, default now
- aktualisiertAm: timestamp, default now

Tabelle `mitglied_mannschaft` (Drizzle: `mitgliedMannschaften`, SQL: `mitglied_mannschaft`):
- id: uuid, primaryKey, defaultGen
- mitgliedId: uuid, notNull, references mitglied(id) onDelete cascade
- mannschaftId: uuid, notNull, references liga_mannschaft(id) onDelete cascade
- saison: text, notNull
- rolle: text, notNull, default "spieler" (Werte: "spieler", "trainer", "betreuer")
- Unique constraint: (mitgliedId, mannschaftId, saison)

Tabelle `beitritt_antrag` (Drizzle: `beitrittAntraege`, SQL: `beitritt_antrag`):
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- vorname: text, notNull
- geburtsdatum: date, nullable
- email: text, notNull
- telefon: text, nullable
- geschlecht: text, nullable
- mannschaftId: uuid, nullable, references liga_mannschaft(id)
- einwilligungen: jsonb, nullable (Objekt mit boolean-Flags)
- erstelltAm: timestamp, default now
- status: text, notNull, default "offen" (Werte: "offen", "angenommen", "abgelehnt")

Tabelle `beitragsklasse` (Drizzle: `beitragsklassen`, SQL: `beitragsklasse`):
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- betrag: integer, notNull (Euro-Cents)
- beschreibung: text, nullable
- aktiv: boolean, default true

### 2. vereine-Ergaenzung

Neues Feld in der `vereine`-Tabelle:
- vereinsverwaltungAktiv: boolean, default false (Drizzle camelCase, SQL: vereinsverwaltung_aktiv)

### 3. RLS-Policies

Siehe bestehende RLS-Patterns in schema.ts (`app.current_verein_id`, `withTenant`).

- `mitglied`: Vereinsadmin sieht nur Datensaetze mit matching verein_id. Standard RLS via app.current_verein_id.
- `mitglied_mannschaft`: eigene Policy, aber indirekt ueber mitglied.verein_id.
- `beitritt_antrag`: SELECT nur fuer Vereinsadmin (RLS via verein_id). INSERT ohne RLS-Einschraenkung (oeffentliches Formular ohne Login). Siehe `src/db/schema.ts` fuer Beispiele von Tabellen mit SELECT-only RLS.
- `beitragsklasse`: RLS via verein_id, wie mitglied.
- Migration muss `ENABLE ROW LEVEL SECURITY` und `CREATE POLICY` fuer jede neue Tabelle enthalten.

### 4. Drizzle-Migration

1. Schema in src/db/schema.ts aendern (alle Tabellen + Felder + RLS)
2. `npx drizzle-kit generate` ausfuehren (mit timeout 300 — kann >60s dauern)
3. Das erzeugte .sql-File unter src/db/migrations/ committen
4. meta/_journal.json und meta/*_snapshot.json committen
5. Migration muss `IF NOT EXISTS` verwenden (additiv, wiederholbar)

### 5. Abrechnung (src/lib/abrechnung.ts)

`betragNetto` um `vereinsverwaltungAktiv: boolean`-Parameter erweitern:
- Wenn aktiv: Basispreis + PREIS_VEREINSVERWALTUNG (regulaer) oder PREIS_VEREINSVERWALTUNG_BETA (beta)
- Sponsor (sponsor=true) uebernimmt immer den kompletten Vereinspreis (Basis oder Basis + Add-on) plus PREIS_SPONSOR. Der Verein zahlt 0.
- Konstanten aus src/lib/beta-konditionen.ts: PREIS_VEREINSVERWALTUNG = 200, PREIS_VEREINSVERWALTUNG_BETA = 200, PREIS_SPONSOR = 200, PREIS_REGULAER = 300, PREIS_BETA = 200

### 6. Tests

- Neue Datei: `src/db/mitglied.test.ts` — Smoke-Test: Tabellen-Definition, RLS-Policy-Vorhandensein
- `npx vitest run` — 17 DB-Integrationstests koennen ohne DATABASE_ADMIN_URL nicht laufen (erwartet). Nur non-DB-Tests als Pruefung.
- `npx tsc --noEmit` mit `NODE_OPTIONS=--max-old-space-size=4096` — muss 0 Fehler sein

### 7. Git

- Branch: `hp/mitgliederverwaltung-phase1`
- Niemals auf main pushen — nur main triggert Vercel-Deploy
- Commit-Author: info@deweconsulting.de, Name: Busi911
- AGENTS.md nicht committen (auto-generated — `git checkout AGENTS.md` vor dem Staging)

### Einschaenkungen

- `npm run build` lokal nicht ausfuehren — haengt ohne DATABASE_ADMIN_URL. Nur `tsc --noEmit`.
- `drizzle-kit generate`: mit `timeout 300` — kann >60s dauern
- `gh` CLI nicht installiert — PRs ueber GitHub API
- German naming: Tabellen in deutsch (`mitglied`, nicht `member`). Siehe CLAUDE.md.
- Drizzle: `.select().from().where()` verwenden, nicht `db.query.*`. Siehe CLAUDE.md.
- Tabellen in SQL: singular (`mitglied`), Spalten: snake_case (`verein_id`).
