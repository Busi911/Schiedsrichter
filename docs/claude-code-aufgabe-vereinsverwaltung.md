# Claude Code — Gesamtauftrag: Vereinsverwaltung als optionales Add-on

## Projekt

HandballerPate — `/opt/data/schiedsrichter`
Next.js 16.4, React 19, Drizzle ORM, Neon Postgres (RLS multi-tenant), Auth.js (JWT), Vitest, PWA.
Hosting: Vercel (fra1), Produktion: handballerpate.de
CLAUDE.md (~86 KB) hat Projektkonventionen — VOR Code-Änderungen lesen.

## Überblick

Ein optionales Add-on „Vereinsverwaltung" bestehend aus Mitgliederverwaltung, Online-Beitritt, Beitragsklassen/SEPA und Abrechnungs-Integration. Baut auf der bestehenden Funktionsträger-Verwaltung + App auf (die unverändert bleibt). In 5 Phasen umsetzen, jede Phase ist eigenständig commitbar und deploybar.

## Preismodell (Kontext)

- **Basis** (Funktionsträger + App): 300 €/Jahr (Beta: 200 €) — unverändert
- **+ Vereinsverwaltung** (Add-on): + 200 €/Jahr (Beta: + 200 €)
- **Gesamt**: 500 €/Jahr (Beta: 400 €)
- **Sponsor**: + 200 € zusätzlich. Übernimmt IMMER den kompletten Vereinspreis (Basis ODER Basis + Add-on) plus 200 € für den Sponsor-Platz. Der Verein zahlt nichts.
  - Beispiele: Basis + Sponsor = 500 € (Sponsor zahlt 300 + 200). Basis + VV + Sponsor = 700 € (Sponsor zahlt 500 + 200).
- Konstanten in `src/lib/beta-konditionen.ts`: PREIS_VEREINSVERWALTUNG = 200, PREIS_VEREINSVERWALTUNG_BETA = 200

---

## Phase 1: Datenmodell und Migration

### Neue Tabellen in `src/db/schema.ts`

#### `mitglied` (Drizzle: `mitglieder`)
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

#### `mitglied_mannschaft` (Drizzle: `mitgliedMannschaften`)
- id: uuid, primaryKey, defaultGen
- mitgliedId: uuid, notNull, references mitglied(id) onDelete cascade
- mannschaftId: uuid, notNull, references liga_mannschaft(id) onDelete cascade
- saison: text, notNull (z. B. \"2026/27\")
- rolle: text, notNull, default \"spieler\" (\"spieler\" | \"trainer\" | \"betreuer\")
- Unique: (mitgliedId, mannschaftId, saison)

#### `beitritt_antrag` (Drizzle: `beitrittAntraege`)
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull
- vorname: text, notNull
- geburtsdatum: date
- email: text, notNull
- telefon: text
- geschlecht: text
- mannschaftId: uuid, nullable, references liga_mannschaft(id) (optional — gewünschte Mannschaft)
- einwilligungen: jsonb ({ datenschutz: boolean, fotos: boolean, vereinigung: boolean })
- erstelltAm: timestamp, default now
- status: text, notNull, default \"offen\" (\"offen\" | \"angenommen\" | \"abgelehnt\")

#### `vereine`-Ergänzung
- Neues Feld: `vereinsverwaltungAktiv`: boolean, default false
- Nur Systemadmin kann setzen (über /system/abrechnung)

#### `beitragsklasse` (Drizzle: `beitragsklassen`) — schon hier anlegen, UI später
- id: uuid, primaryKey, defaultGen
- vereinId: uuid, notNull, references vereine(id)
- name: text, notNull (z. B. \"Erwachsene\", \"Jugend\", \"Familie\")
- betrag: integer, notNull (in Euro-Cents)
- beschreibung: text
- aktiv: boolean, default true

### RLS-Policies

- `mitglied`: Vereinsadmin sieht nur Mitglieder seines Vereins (RLS via `app.current_verein_id`). Siehe bestehende Patterns in schema.ts.
- `mitglied_mannschaft`: indirekt über mitglied.verein_id — aber eigene Policy für DELETE/UPDATE.
- `beitritt_antrag`: 
  - SELECT: nur Vereinsadmin (RLS via verein_id)
  - INSERT: öffentlich (ohne Login) — der Antrag kommt vom öffentlichen Formular. Entweder RLS-Policy, die INSERT ohne auth erlaubt, oder INSERT ohne RLS (nur SELECT hat RLS).
- `beitragsklasse`: Vereinsadmin (RLS via verein_id)
- `vereine.vereinsverwaltungAktiv`: nur Systemadmin kann schreiben (bestehende adminDb-Route)

### Drizzle-Migration

1. Schema in `src/db/schema.ts` ändern
2. `npx drizzle-kit generate` (mit `timeout 300` — kann >60s dauern)
3. `.sql`-File unter `src/db/migrations/` committen
4. `meta/_journal.json` und `meta/*_snapshot.json` committen
5. Migration muss `IF NOT EXISTS` verwenden (additiv, wiederholbar)
6. `migrate-on-deploy.mjs` wendet sie beim Vercel-Deploy automatisch an

### Abrechnung (`src/lib/abrechnung.ts`)

- `betragNetto` um `vereinsverwaltungAktiv: boolean`-Parameter erweitern
- Wenn aktiv: Basispreis + PREIS_VEREINSVERWALTUNG (regulär) oder PREIS_VEREINSVERWALTUNG_BETA (Beta)
- Sponsor übernimmt immer den kompletten Vereinspreis (Basis oder Basis + Add-on) + PREIS_SPONSOR
- `Tarif`-Typ unverändert (\"befreit\" | \"beta\" | \"regulaer\") — das Add-on ist ein Flag, kein eigener Tarif

### Tests

- Neue Testdatei: `src/db/mitglied.test.ts` (RLS, CRUD, mindestens Smoke-Test)
- `npx vitest run` — 17 DB-Integrationstests können ohne DATABASE_ADMIN_URL nicht laufen (erwartet), nur non-DB-Tests als Prüfung
- `npx tsc --noEmit` mit `NODE_OPTIONS=--max-old-space-size=4096` — muss 0 Fehler sein

### Git

- Feature-Branch: `hp/mitgliederverwaltung-phase1`
- **Niemals auf main pushen** — nur main triggert Vercel-Deploy
- Commit-Author: `info@deweconsulting.de`, Name: `Busi911`

---

## Phase 2: Admin-Oberfläche

### Routes

- `/admin/mitglieder` — Liste mit Suche, Filter nach Mannschaft, Status-Änderung (aktiv/passiv/ausgetreten), Detailansicht. Vereinsadmin (RLS, nur eigene Mitglieder).
- `/admin/mitglieder/[id]` — Stammdaten bearbeiten, Mannschaften zuordnen (mit Saison), Austritt eintragen, Bemerkung.
- `/admin/mitglieder/import` — Excel-Import (bestehende Logik aus Funktionsträgerverwaltung wiederverwenden — siehe `src/lib/excel-import.ts` oder ähnlich).
- `/admin/einstellungen` — Toggle für `vereinsverwaltungAktiv` (Vereinsadmin kann aktivieren/deaktivieren). Bei Aktivierung: Hinweis auf Preis (+ 200 €/Jahr).

### UI

- Bestehende UI-Komponenten verwenden: `Card`, `Badge`, `Button`, `Input`, `Dialog` aus `@/components/ui/`
- Layout: `src/app/admin/(dashboard)/layout.tsx` (bestehend)
- Bottom-Nav: bestehend — Mitglieder-Tab ergänzen (nur wenn `vereinsverwaltungAktiv`)
- Mobile-first: Tabelle als Liste auf Mobile, nicht als HTML-Tabelle (siehe bestehende Mannschaften-Liste)

### Server Actions

- `holeMitglieder(vereinId, filter)` — Liste mit Paginierung
- `holeMitglied(id)` — Detail
- `speichereMitglied(id, daten)` — Stammdaten aktualisieren
- `mitgliedZuMannschaft(id, mannschaftId, saison, rolle)` — Zuordnung
- `mitgliedVonMannschaftEntfernen(id, mannschaftId, saison)` — Zuordnung entfernen
- `mitgliedAustritt(id, datum)` — Status auf \"ausgetreten\", austrittsdatum setzen
- `importiereMitglieder(vereinId, datei)` — Excel-Import
- `exportiereMitglieder(vereinId)` — CSV-Export (Download)

### RLS

- Alle Server Actions verwenden den regulären `db`-Client (RLS-scoped), nicht `adminDb`
- Vereinsadmin sieht nur Mitglieder seines Vereins

### Tests

- UI-Tests (Vitest): Render, Filter, Status-Änderung
- Server-Action-Tests: CRUD mit Mock-DB
- `npx tsc --noEmit`: 0 Fehler

### Git

- Feature-Branch: `hp/mitgliederverwaltung-phase2`
- Nicht auf main pushen

---

## Phase 3: Online-Beitritt

### Route

- `/verein/[slug]/beitritt` — öffentliche Seite, kein Login erforderlich
- Formular mit:
  - Name, Vorname (Pflicht)
  - Geburtsdatum (Pflicht für DSGVO bei Minderjährigen)
  - Email (Pflicht)
  - Telefon (optional)
  - Geschlecht (optional)
  - Gewünschte Mannschaft (Dropdown aus `liga_mannschaften` des Vereins — optional)
  - DSGVO-Einwilligungen:
    - Datenschutzerklärung gelesen und zugestimmt (Pflicht-Checkbox)
    - Fotos/Videos bei Minderjährigen: Einwilligung (Checkbox, optional — wenn nicht, wird im Verein vermerkt)
    - Vereinsmitgliedschaft: Satzung gelesen und zugestimmt (Pflicht-Checkbox)
  - Keine Zahlung — nur Antrag, der Vereinsadmin nimmt an

### Server Action

- `reicheBeitrittAntragEin(vereinSlug, daten)` — 
  - Validierung: Pflichtfelder, Email-Format, Geburtsdatum plausibel
  - Speichern in `beitritt_antrag` mit status \"offen\"
  - Mail an Vereinsadmin (bestehendes Mail-System `src/lib/mailer.ts`): \"Neuer Beitrittsantrag: [Name]\"
  - Bestätigungs-Mail an Antragsteller: \"Antrag eingegangen — der Verein meldet sich\"

### Admin-Aktionen

- In `/admin/mitglieder`: Liste offener Beitrittsanträge (eigener Tab oder Badge)
- `nehmeBeitrittAn(id)` — 
  - Erzeugt neues `mitglied` mit status \"aktiv\", eintrittsdatum = heute
  - Übernimmt Stammdaten aus dem Antrag
  - Übernimmt Mannschafts-Wunsch (wenn angegeben)
  - Setzt antrag.status = \"angenommen\"
  - Mail an Antragsteller: \"Willkommen — dein Antrag wurde angenommen\"
- `lehneBeitrittAb(id, grund?)` — 
  - Setzt antrag.status = \"abgelehnt\"
  - Optionale Mail an Antragsteller mit Grund

### Tests

- Formular-Test: Pflichtfelder, Validierung, erfolgreiche Einreichung
- Admin-Aktion-Tests: Annehmen, Ablehnen, Mail-Versand
- `npx tsc --noEmit`: 0 Fehler

### Git

- Feature-Branch: `hp/mitgliederverwaltung-phase3`

---

## Phase 4: Abrechnungs-Integration

### Systemadmin-Bereich (`/system/abrechnung`)

- In der bestehenden Abrechnungs-Tabelle pro Verein: Checkbox „Vereinsverwaltung aktiviert\"
- Wenn aktiviert: `vereine.vereinsverwaltung_aktiv = true` (über `adminDb`)
- Preis in der Abrechnungs-Übersicht: Basis + 200 € = 500 € (oder Beta: 200 + 200 = 400 €)
- Sponsor übernimmt: Gesamtpreis (500 € oder 400 €) + 200 € Sponsor-Platz = 700 € (oder 600 €)

### Vereinsadmin-Bereich (`/admin/einstellungen`)

- Toggle: „Vereinsverwaltung aktivieren\" — zeigt Hinweis auf + 200 €/Jahr
- Bei Aktivierung: Mail an info@deweconsulting.de (Systemadmin muss in `/system/abrechnung` freischalten)
- Bei Deaktivierung: Mitglieder-Daten bleiben, aber UI wird ausgeblendet

### Abrechnungs-Logik (`src/lib/abrechnung.ts`)

- `betragNetto(tarif, sponsor, vereinsverwaltungAktiv)`:
  - Basis: tarif === \"befreit\" ? 0 : tarif === \"beta\" ? PREIS_BETA : PREIS_REGULAER
  - + Add-on: vereinsverwaltungAktiv ? (tarif === \"beta\" ? PREIS_VEREINSVERWALTUNG_BETA : PREIS_VEREINSVERWALTUNG) : 0
  - + Sponsor: sponsor ? PREIS_SPONSOR : 0
  - Sponsor übernimmt ALLES: bei sponsor=true zahlt der Verein 0, der Sponsor zahlt Basis + Add-on + 200

### Tests

- `betragNetto` mit allen Kombinationen: (befreit/beta/regulaer) × (sponsor true/false) × (vereinsverwaltung true/false) = 12 Fälle
- `npx tsc --noEmit`: 0 Fehler

### Git

- Feature-Branch: `hp/mitgliederverwaltung-phase4`

---

## Phase 5: Abnahme mit Pilotverein

- Keine Code-Änderung — sondern:
- Ein Beta-Verein testet die Mitgliederverwaltung im Spielbetrieb
- DSGVO-Prüfung: Einwilligungen, Löschfristen, Auskunftsersuchen
- Feedback sammeln, Roadmap aktualisieren
- Förderantrag durch den Pilotverein einreichen (docs/foerderantrag-deinehrenamt.md)

---

## Globale Einschränkungen (alle Phasen)

- `DATABASE_ADMIN_URL` ist nicht lokal gesetzt — `npm run build` hängt ohne DB. Nur `npx tsc --noEmit` verwenden.
- `next build` lokal: nicht ausführen (hängt)
- `drizzle-kit generate`: mit `timeout 300` oder background — kann >60s dauern
- Keine produktiven Deployments, keine DB-Migrationen manuell ausführen — nur Schema + Migration-File committen
- `gh` CLI ist nicht installiert — PRs über GitHub API mit Token aus Git-Remote-URL
- Commit-Author: `info@deweconsulting.de`, Name: `Busi911` (Vercel erfordert diese E-Mail)
- **Niemals auf main pushen** — nur Feature-Branches. Main triggert Vercel-Production-Deploy.
- `AGENTS.md` ist auto-generated — nicht committen (`git checkout AGENTS.md` vor dem Staging)
- `tsc --noEmit` mit `NODE_OPTIONS=--max-old-space-size=4096` — das Projekt ist groß genug für OOM mit Default-1GB-Heap
- Vitest: `npx vitest run` mit `timeout 600` (nicht `execute_code`, das bei 300s cappt) — 17 DB-Integrationstests failen ohne DATABASE_ADMIN_URL (erwartet), nur non-DB-Tests als Prüfung
- German naming: Funktionen, Variablen, Tabellen in deutsch (siehe CLAUDE.md). `mitglied`, nicht `member`.
- RLS: Vereinsadmin-Route verwendet `db` (RLS-scoped), Systemadmin/Cron verwendet `adminDb` (bypasses RLS). Siehe `src/db/admin.ts` und `src/db/schema.ts`.
- Drizzle: `.select().from().where()` verwenden, nicht `db.query.*` (siehe CLAUDE.md)
- Tabellen in SQL: singular (`mitglied`, nicht `mitglieder`), Spalten: snake_case (`verein_id`, nicht `vereinId`)

## Relevante Dateien (vor Beginn lesen)

- `CLAUDE.md` — Projektkonventionen (86 KB)
- `src/db/schema.ts` — Alle Tabellen, RLS-Policies, Drizzle-Definitionen
- `src/lib/abrechnung.ts` — Tarif, betragNetto, Zahlungsstatus
- `src/lib/beta-konditionen.ts` — PREIS_VEREINSVERWALTUNG, PREIS_SPONSOR, BETA_ENDE
- `src/components/footer.tsx` — Footer mit Roadmap-Link
- `src/app/admin/(dashboard)/layout.tsx` — Admin-Layout
- `src/app/system/abrechnung/page.tsx` — Systemadmin-Abrechnung
- `docs/umsetzungsplan-vereinsverwaltung.md` — Dieser Plan als Markdown
