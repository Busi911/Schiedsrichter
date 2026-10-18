# Aufgabe für Claude Code: Phase 1 — Datenmodell Vereinsverwaltung

## Projekt

HandballerPate — `/opt/data/schiedsrichter`
Next.js 16.4, React 19, Drizzle ORM, Neon Postgres (RLS multi-tenant), Auth.js (JWT), Vitest, PWA.
Hosting: Vercel (fra1), Produktion: handballerpate.de
CLAUDE.md (~86 KB) hat Projektkonventionen — VOR Code-Änderungen lesen.

## Was gebaut wird

Ein optionales Add-on „Vereinsverwaltung" bestehend aus:
1. Mitgliederverwaltung (Stammdaten, Eintritt/Austritt, Zuordnung zu Mannschaften)
2. Online-Beitrittsformular (öffentlich, DSGVO-Einwilligungen)
3. Beitragsklassen und SEPA (später, jetzt nur Schema)
4. Abrechnungs-Integration (vereinsverwaltung_aktiv Flag)

Diese Phase: **Datenmodell und Migration** — Schema, Tabellen, RLS, Drizzle-Migration.

## Preismodell (Kontext, nicht Teil dieser Aufgabe)

- Basis (Funktionsträger + App): 300 €/Jahr (Beta: 200 €) — unverändert
- + Vereinsverwaltung: + 200 €/Jahr (Beta: + 200 €)
- Gesamt: 500 €/Jahr (Beta: 400 €)
- Sponsor: + 200 € zusätzlich, übernimmt IMMER den kompletten Vereinspreis (Basis oder Basis + Add-on)

## Technische Vorgaben

### 1. Schema in `src/db/schema.ts`

Neue Tabellen (Drizzle, snake_case in SQL, camelCase im JS):

#### `mitglieder` (Tabelle: `mitglied`)
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- vorname: text, notNull
- geburtsdatum: date
- email: text
- telefon: text
- geschlecht: text (\"m\" | \"w\" | \"divers\" | null)
- status: text, notNull, default \"aktiv\" (\"aktiv\" | \"passiv\" | \"ausgetreten\")
- eintrittsdatum: date, default now
- austrittsdatum: date
- bemerkung: text
- erstelltAm: timestamp, default now
- aktualisiertAm: timestamp, default now

#### `mitglied_mannschaft` (Tabelle: `mitglied_mannschaft`)
- id: uuid, primaryKey, defaultGen
- mitgliedId: uuid, notNull, references mitglied(id) onDelete cascade
- mannschaftId: uuid, notNull, references liga_mannschaft(id) onDelete cascade
- saison: text, notNull (z. B. \"2026/27\")
- rolle: text, notNull, default \"spieler\" (\"spieler\" | \"trainer\" | \"betreuer\")

Unique constraint: (mitgliedId, mannschaftId, saison)

#### `beitritt_antrag` (Tabelle: `beitritt_antrag`)
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- vorname: text, notNull
- geburtsdatum: date
- email: text, notNull
- telefon: text
- geschlecht: text
- mannschaftId: uuid, nullable, references liga_mannschaft(id) (optional — gewünschte Mannschaft)
- einwilligungen: jsonb (Objekt mit boolean-Flags: datenschutz, fotos, vereinigung)
- erstelltAm: timestamp, default now
- status: text, notNull, default \"offen\" (\"offen\" | \"angenommen\" | \"abgelehnt\")

#### `vereine`-Ergänzung
- Neues Feld: `vereinsverwaltungAktiv`: boolean, default false
- In `schema.ts` der `vereine`-Tabelle hinzufügen

### 2. RLS-Policies

- `mitglied`: Vereinsadmin sieht nur Mitglieder seines Vereins (RLS via `app.current_verein_id`)
- `mitglied_mannschaft`: indirekt über mitglied.verein_id
- `beitritt_antrag`: 
  - **Lesen**: nur Vereinsadmin (RLS via verein_id)
  - **Schreiben ( INSERT)**: öffentlich (ohne Login) — der Antrag kommt vom öffentlichen Formular
  - Das bedeutet: RLS für SELECT, aber INSERT ohne RLS (oder mit Policy, die INSERT erlaubt)
- `vereine.vereinsverwaltung_aktiv`: nur Systemadmin kann setzen (über /system/abrechnung)

Siehe `src/db/schema.ts` für bestehende RLS-Patterns (`withTenant`, `app.current_verein_id`).
Migration muss `ENABLE ROW LEVEL SECURITY` und `CREATE POLICY` für neue Tabellen enthalten.

### 3. Drizzle-Migration

1. Schema in `src/db/schema.ts` ändern (Tabellen + Felder + RLS)
2. `npx drizzle-kit generate` ausführen (mit `timeout 300` — kann >60s dauern)
3. Das erzeugte `.sql`-File unter `src/db/migrations/` committen
4. `meta/_journal.json` und `meta/*_snapshot.json` committen
5. Migration muss `IF NOT EXISTS` verwenden (additiv, wiederholbar)
6. `migrate-on-deploy.mjs` wendet sie beim Vercel-Deploy automatisch an

### 4. Abrechnung (`src/lib/abrechnung.ts`)

- `betragNetto` um `vereinsverwaltungAktiv`-Parameter erweitern
- Wenn aktiv: Basispreis + PREIS_VEREINSVERWALTUNG (oder PREIS_VEREINSVERWALTUNG_BETA)
- Sponsor übernimmt immer den kompletten Vereinspreis (Basis oder Basis + Add-on) + PREIS_SPONSOR
- Konstanten aus `src/lib/beta-konditionen.ts`: PREIS_VEREINSVERWALTUNG = 200, PREIS_VEREINSVERWALTUNG_BETA = 200

### 5. Tests

- Neue Testdatei: `src/db/mitglied.test.ts` (RLS, CRUD, mindestens Smoke-Test)
- `npx vitest run` — DB-Integrationstests können ohne DATABASE_ADMIN_URL nicht laufen (17 failures erwartet), nur non-DB-Tests als Prüfung
- `npx tsc --noEmit` mit `NODE_OPTIONS=--max-old-space-size=4096` — muss 0 Fehler sein

### 6. Git

- Feature-Branch: `hp/mitgliederverwaltung-phase1`
- **Niemals auf main pushen** — nur main triggert Vercel-Deploy
- Commit-Author: `info@deweconsulting.de`, Name: `Busi911`
- `gh` CLI ist nicht installiert — PRs über GitHub API mit Token aus Git-Remote-URL

## Was NICHT gebaut wird (spätere Phasen)

- Admin-Oberfläche / UI (Phase 2)
- Online-Beitrittsformular / Server Actions (Phase 3)
- SEPA-Lastschrift (später)
- Neuigkeiten-Seite (später)

## Relevante Dateien

- `src/db/schema.ts` — Drizzle-Schema, alle Tabellen, RLS-Policies
- `src/lib/abrechnung.ts` — Tarif, betragNetto, Zahlungsstatus
- `src/lib/beta-konditionen.ts` — PREIS_VEREINSVERWALTUNG, PREIS_SPONSOR, BETA_ENDE
- `CLAUDE.md` — Projektkonventionen (German naming, Drizzle patterns, RLS rules)
- `docs/umsetzungsplan-vereinsverwaltung.md` — Vollständiger Umsetzungsplan mit 5 Phasen

## Einschränkungen

- `DATABASE_ADMIN_URL` ist nicht lokal gesetzt — `npm run build` hängt ohne DB. Nur `npx tsc --noEmit` verwenden.
- `next build` lokal: nicht ausführen (hängt)
- `drizzle-kit generate`: mit `timeout 300` oder background
- Keine produktiven Deployments, keine DB-Migrationen manuell ausführen — nur Schema + Migration-File committen
