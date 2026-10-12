# HandballerPate – Mobile Improvement Roadmap (Aufgabenliste)

Abgeleitet aus [`MOBILE_APP_AUDIT.md`](./MOBILE_APP_AUDIT.md) (Stand 12.10.2026). Jede Phase ist für sich auslieferbar und testbar. Innerhalb einer Phase sind die Aufgaben möglichst unabhängig, also je Aufgabe ein PR.

**Regeln für alle Aufgaben:**
- **Next.js 16:** vor Änderungen an Routing, Caching oder Metadaten die Doku in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).
- **Prüfgrößen:** jede UI-Änderung bei **360, 375, 390 und 430 px** prüfen (`CLAUDE.md` → Mobile-Optimierung), in **Hell und Dunkel**.
- **Gestaltung:** nur Design-Tokens, keine festen Hellfarben. Tippflächen ≥ 44 px, Schrift ≥ 12 px, Animationen nur mit `motion-safe:`.
- **Datenschutz:** keine neuen Personendaten. Favoriten bleiben im Gerät, kein Tracking. Die Whitelists der Parser bleiben unberührt.
- **Tests:** reine Logik → Vitest. Sichtbares Verhalten → Playwright-Smoke (Phase 0 legt die Basis).
- **Hilfe:** neue Funktionen → Abschnitt in `/app-hilfe` (Fans) bzw. `/hilfe` (Verein) ergänzen.

Legende: **Aufwand** S ≤ 1 Tag · M 2–4 Tage · L ≥ 1 Woche.

---

> **Umsetzungsstand 12.10.2026:** Phase 1 und große Teile von Phase 2 sind in PR #373 umgesetzt (Branch `feature/mobile-spielstatus-navigation`). Statt eines erweiterten `spielPhase`-Enums gibt es `ergebnisHinweis` (1.2). Offen: 0.1/0.2 (Seed + Playwright-Smoke), 1.2 (Enum), 2.9 (Sponsor-Dialog), Phase 3 ff. (außer 3.7 Karten-Link zur Halle).

## Phase 0 – Absicherung (Voraussetzung, S–M)

- [ ] **0.1 Seed für die Fan-App:** ein Skript, das einen öffentlichen Verein mit Mannschaften, Tabellen und Spielen in allen Phasen anlegt: vergangen bestätigt, vorläufig, gestern ohne Ergebnis, läuft gerade, heute später, verlegt, abgesagt, kommend.
  - Datei: `scripts/fan-seed/seed.ts`, analog `scripts/produkttour/seed.ts`. Nur gegen lokale Wegwerf-DB.
  - Abnahme: `/verein/<slug>` zeigt alle Phasen.
- [ ] **0.2 Playwright-Smoke-Tests (mobil):** 360 und 390 px, alle Fan-Routen (`/`, `/verein`, `/verein/<slug>{,/spiele,/mannschaften,/statistik}`, `/verein/<slug>/<team>{,/spielplan,/ergebnisse,/tabelle}`, `/meine`, `/app-hilfe`). Prüft je Route:
  - Status 200
  - kein horizontaler Überlauf (`scrollWidth <= clientWidth`)
  - keine Tippfläche < 44 px in `main` (Allowlist für Ausnahmen)
  - eine `h1`

  Abnahme: läuft lokal und in CI (eigener Workflow, nicht im normalen `npm test`).
- [x] **0.3 Regressionstests für die bekannten Statusfehler** in `liga-spiele-hilfen.test.ts` / `liga-spiel-status.test.ts`. Zuerst **rot** schreiben (dokumentiert den Fehler):
  - laufendes Spiel ist nicht „vergangen“
  - gestern ohne Ergebnis wird angezeigt
  - abgesagtes vergangenes Spiel wird angezeigt

---

## Phase 1 – Korrektheit am Spieltag (P0, ~2 Tage)

- [x] **1.1 Entscheidung Zwischenstand** (Betreiber): Variante A (empfohlen) zeigt keine Zahl während des Spiels, sondern „Läuft gerade“ und danach „Ergebnis folgt“. Variante B zeigt die Zahl mit „Stand HH:MM“.
  - Ergebnis in `CLAUDE.md` (Abschnitt Spielbericht-Link/Live-Ticker) festhalten.
- [ ] **1.2 `spielPhase` erweitern** (`lib/liga-spiel-status.ts`): `geplant · laeuft · ergebnis_folgt · ausstehend · beendet · vorlaeufig · verlegt · abgesagt · nicht_angetreten`. Tests für alle Grenzen (90 min, 3 h, Tageswechsel in deutscher Zeit).
- [x] **1.3 Listenlogik auf `spielPhase`** (`lib/liga-spiele-hilfen.ts`):
  - `sammleVereinsSpiele` liefert zusätzlich `heute` (laufend, ergebnis_folgt, heute geplant).
  - „ausstehend“ erscheint unter Ergebnisse mit Hinweis „Ergebnis ausstehend“.
  - Abgesagte Spiele bleiben mit Status sichtbar.
  - Abnahme: Tests aus 0.3 grün.
- [x] **1.4 `SpielKarte` nach Entscheidung 1.1** (`components/liga/liga-ui.tsx`) und `/meine` (`meine-mannschaften.tsx`) angleichen: dieselbe Phase, dieselben Texte.
  - „vorläufig“ ausschreiben statt „*“.
  - Status-Badge „Verlegt“/„Abgesagt“ auf `/meine` (`status` liefert die API schon).
- [x] **1.5 Mannschafts-Übersicht** (`app/verein/[slug]/[team]/page.tsx`): „Letztes Ergebnis“ nimmt nur beendete Spiele. Ein laufendes Spiel erscheint als eigener Block „Läuft gerade“ über „Nächstes Spiel“.
- [x] **1.6 Bereich „Heute“** oben auf `/verein/<slug>` und `/spiele`, nur wenn es heute Spiele gibt.
- [x] **1.7 Hilfetexte prüfen:** `/app-hilfe` (Abschnitt `spiele`) und `/hilfe` müssen der Umsetzung entsprechen.
- [x] **1.8 Startseite:** `hyphens-auto` an der Hero-H1 (`app/page.tsx`). Abnahme: kein Überlauf bei 360 px (Smoke 0.2).

---

## Phase 2 – Navigation ohne Sackgassen + Bedienbarkeit (P1, ~2–3 Tage)

- [x] **2.1 Bottom-Bar auf Mannschaftsseiten:** `components/liga/vereins-nav.tsx` markiert unter `/<team>` „Teams“ als aktiv statt `null` zu liefern. `pb-28 md:pb-0` im `[team]/layout.tsx`.
- [x] **2.2 Teamkopf kompakt** (`[team]/layout.tsx`):
  - Vereinsname nur einmal.
  - Zurück über `components/zurueck-button.tsx` (Historie), Fallback `/verein/<slug>/mannschaften`.
  - Liga und Platz in einer Zeile.
- [x] **2.3 Team-Wechsler:** neues Client-Sheet `components/liga/team-wechsler.tsx`. Tippen auf den Mannschaftsnamen zeigt alle Mannschaften, Favoriten oben. Daten aus dem schon geladenen `holeMannschaften`, kein neuer Request.
  - Abnahme: Wechsel in 2 Taps, Fokusführung, Esc schließt.
- [x] **2.4 Tippflächen ≥ 44 px:**
  - `favorit-stern.tsx` (`size-11`)
  - `installieren.tsx` (Schließen)
  - Links „Spielbericht“/„Live-Ticker“ in `liga-ui.tsx` (`min-h-11 inline-flex items-center`)
  - Team-Tabs (`team-tabs.tsx`), Filter-Chips (`gefilterte-liste.tsx`, `min-h-11`)
  - Kopf-Links in `fan-rahmen.tsx`
  - „Vereine ansehen“ (`meine-mannschaften.tsx`)
  - `app/app-hilfe/page.tsx`

  Abnahme: Smoke 0.2 ohne Allowlist-Einträge für diese Elemente.
- [x] **2.5 Lesbarkeit und Bewegung:**
  - `text-[10px]`/`text-[11px]` in `liga-ui.tsx` und `statistik-karte.tsx` → mindestens `text-xs`.
  - `motion-safe:animate-pulse` am Live-Punkt.
  - Sieg/Unentschieden/Niederlage zusätzlich als Buchstabe.
  - `FormChips` mit `role="img"`.
- [x] **2.6 Konsistenz:** `mitAusgang` auch in `[team]/ergebnisse/page.tsx`. Datumsformat einheitlich (`formatSpieltag` mit „Uhr“).
- [x] **2.7 Filter-Chips:** `flex-auto` entfernen (keine einsame volle Zeile). Bei mehr als 4 Chips horizontal scrollbar mit `snap-x`.
- [x] **2.8 Zustände:**
  - `loading.tsx` (Skeleton) für `verein/[slug]`, `verein/[slug]/[team]` und `meine`.
  - `not-found.tsx` (deutsch, mit Vereinssuche) global und unter `verein/[slug]`.
  - Skeleton statt „Lädt…“ auf `/meine`.
  - Leertext bei leerer API-Antwort.
- [ ] **2.9 Sponsor-Splash a11y:** `aria-modal="true"`, Fokus auf „Weiter“, Fokus zurück beim Schließen, Button ≥ 44 px.

---

## Phase 3 – „Meine“ als Zuhause, Kalender, Teilen (P1, ~1 Woche)

- [ ] **3.1 Favoriten-API ohne N+1** (`app/api/liga/favoriten/route.ts`): Mannschaften → Teilnahmen → Gruppen → Tabellenzeilen und Spiele mit je **einer** `inArray`-Abfrage. Vereinsfavoriten analog.
  - Ausgabe zusätzlich mit `phase` (aus 1.2).
  - Test für die Route (Mock `@/db/admin`).
  - Abnahme: Anzahl Abfragen unabhängig von der Zahl der Vereine (≤ 6).
- [ ] **3.2 Dashboard `/meine`** (`components/liga/meine-mannschaften.tsx`), Abschnitte:
  1. **Jetzt** (laufend, ergebnis_folgt)
  2. **Als Nächstes** (chronologisch über alle Favoriten, relative Zeit „in 3 Tagen“)
  3. **Neu seit deinem letzten Besuch** (Zeitstempel nur in localStorage)
  4. **Meine Teams** (horizontal: Platz, Form)
- [ ] **3.3 Startseite für Wiederkehrer:** Mit Favoriten (Cookie `hp_fav` ist serverseitig lesbar) steht oben „Weiter zu Meine Mannschaften“, die Vereinssuche als erstes Element über dem Admin-Hero.
  - **Produktentscheidung Betreiber:** Gewichtung Fan- vs. Vereinsakquise.
- [ ] **3.4 Profil → öffentliche Mannschaftsseite:** In `/profil` (Trainer/Funktionsträger) ein Link „Meine Mannschaft öffentlich ansehen“ über `mannschaft.liga_mannschaft_id`. Nur Link, keine neue Logik.
- [ ] **3.5 ICS-Feed je Mannschaft:** `app/verein/[slug]/[team]/kalender.ics/route.ts`.
  - Inhalt: nur öffentliche Spieldaten, UID stabil aus `liga_spiel.id`, Verlegungen über `SEQUENCE`/`LAST-MODIFIED`.
  - `Cache-Control: public, s-maxage=3600`.
  - Button „Kalender abonnieren“ (`webcal://` + „Link kopieren“) auf der Mannschafts-Übersicht.
  - Tests: Format und Escaping.
  - Datenschutzseite um einen Satz ergänzen (keine Personendaten).
- [ ] **3.6 Teilen:** `components/liga/teilen-button.tsx` (`navigator.share`, Fallback Zwischenablage mit `aria-live`-Hinweis) auf Spielzeile, Mannschaftskopf und Vereinskopf. Text ohne Tracking-Parameter.
- [x] **3.7 Karten-Link zur Halle:** `halle_name` als Link (Kartensuche per Name, keine Speicherung). Bei Heimspielen in eigener Halle Hinweis „Heimspiel“.
- [ ] **3.8 Folgen statt Stern:**
  - `favorit-stern.tsx`-Variante mit Text („Folgen“ / „Folge ich“) im Team- und Vereinskopf.
  - Nach dem ersten Folgen ein Toast mit Link zu „Meine“.
  - Einmaliger Hinweis „Welche Mannschaft interessiert dich?“ auf der Vereinsseite (localStorage).

---

## Phase 4 – Performance und Offline (P1, M–L)

- [ ] **4.1 Root-Layout entdynamisieren:** `auth()` aus `components/footer.tsx` herauslösen. Entweder kleiner Client-Teil, der den Link „Verein registrieren“ nach der Session ausblendet, oder Footer-Variante ohne Session für Fan-Layouts.
  - Abnahme: `next build` zeigt `/app-hilfe`, `/impressum`, `/datenschutz` als statisch.
- [ ] **4.2 Daten-Cache für öffentliche Liga-Daten** (`lib/liga-oeffentlich.ts`): Cache je Verein mit Tag. Invalidierung am Ende der Sync-Läufe (nuLiga, handball.net, NDR, Admin-Einstellungen „Öffentliche Seite“).
  - **Wichtig:** zeitabhängige Phase (`laeuft`, `ergebnis_folgt`) wird im Render aus `jetzt` berechnet und nie mitgecacht.
  - Vorschau-Vereine (Cookie) nie in einen gemeinsamen Cache (`CLAUDE.md` → Vorschau-Link).
  - Doku in `node_modules/next/dist/docs/` lesen.
  - Abnahme: Abfragen pro Seitenaufruf messbar gesenkt (Log/Zähler im Test).
- [ ] **4.3 Doppelte Abfragen entfernen:** `verein.status` nicht in `holeVerein` *und* `holeVorschau` laden. `holeVereinsDesign` ohne zweiten `liga_verein`-Read. Layout-Abfragen (Design, Vorschau, Sponsor) parallel.
- [ ] **4.4 Sitemap:** nur Slugs laden (eine Abfrage), nicht `holeMannschaften` je Verein.
- [ ] **4.5 Icon- und Logo-Routen:** `s-maxage` ergänzen (URLs sind über `?v=` versioniert). Optional berechnete Icons speichern statt bei jedem Aufruf `sharp`.
- [ ] **4.6 Service Worker** (`public/sw.js`):
  - Netz-Timeout (~4 s) mit Rückfall auf den Cache.
  - Offline-Fallback-Seite.
  - Version aus Build bzw. Hash.
  - Optional `/_next/static` cache-first.
  - Abnahme: Playwright offline-Test (`context.setOffline(true)`) für eine zuvor besuchte Seite.
- [ ] **4.7 Fonts:** prüfen, ob `Geist_Mono` auf Fan-Seiten gebraucht wird, sonst nur in Admin-Layouts laden.

---

## Phase 5 – Design-Überarbeitung „Anzeigetafel“ (P2, M)

- [ ] **5.1 Status- und Ergebnis-Tokens** in `app/globals.css` (`--status-live`, `--status-sieg`, `--status-remis`, `--status-niederlage`, `--status-hinweis`), jeweils für Hell, Dunkel und `.fan`.
- [ ] **5.2 `SpielZeile`** (`components/liga/spiel-zeile.tsx`): kompakte, tippbare Zeile mit Spielstand 28–32 px `tabular-nums`, Gegner-Initialen (`vereinsInitialen`), Varianten je Phase, Aktionsleiste mit 44-px-Buttons. `SpielKarte` leitet intern darauf um.
- [ ] **5.3 `TagesGruppe`:** ein Container je Tag statt einer Karte je Spiel. `GefilterteListe` verwendet ihn.
  - Abnahme: ≥ 5 Spiele sichtbar bei 375×667 auf `/spiele`.
- [ ] **5.4 Vereinskopf kompakt** (`fan-rahmen.tsx`): 56 px Höhe, Logo, Name, Folgen. Kopf-Links (Vereine, Meine, Hilfe) in ein Menü.
- [ ] **5.5 Tabelle mobil:** `+/-` statt Tore unter `sm`, Tore beim Antippen der Zeile. Tabellenausschnitt (eigener Platz ±2) auf der Mannschafts-Übersicht.
- [ ] **5.6 Filter als Sheet** (Favoriten, Kategorien, einzelne Mannschaft), optional `?f=` in der URL. Default serverseitig aus `hp_fav`, damit nach der Hydration nichts springt.
- [ ] **5.7 `/app-hilfe` im Fan-Design** (FanKopf, Theme).
- [ ] **5.8 Navigation (Variante nach Entscheidung):** entweder die vier heutigen Reiter plus „Meine“-Default, oder die neue Leiste „Meine · Spiele (kommend/Ergebnisse) · Teams · Tabellen“. URLs bleiben erhalten.

---

## Phase 6 – Weiterentwicklung (P2)

- [ ] **6.1 Spiel-Detailseite** `/verein/[slug]/spiel/[id]`: Halbzeit, Duelle, Halle mit Karten-Link, Links, Teilen, JSON-LD.
- [ ] **6.2 Wochenend-Bild zum Teilen** (`ImageResponse`, Vereinsdesign, alle Ergebnisse Sa/So). Nützlich für Vereins-Social-Media.
- [ ] **6.3 Zuletzt besucht** (localStorage, max. 5) auf `/` und `/verein`.
- [ ] **6.4 Suche verbessern** (`vereinsuche.tsx`, `lib/vereinsliste.ts`): Normalisierung von Umlauten und Kürzeln (TSV, HSG, SG, TV), Treffer auch nach Ort und Mannschaft. Ab ~300 Vereinen serverseitig mit Limit.
- [ ] **6.5 PWA:** `scope` je Verein (`/verein/<slug>/`), `shortcuts` (Spiele, Teams, Meine). Bestehende Installationen beachten.
- [ ] **6.6 `StandHinweis`:** Quellen aus den genutzten Gruppen (`verband`, `quelle`) ableiten statt fest „Hessischer Handball-Verband“.
- [ ] **6.7 Gegner-Platz** auf der Spielzeile („Pl. 4“) aus `liga_tabellenzeile`.
- [ ] **6.8 `/mannschaften`:** favorisierte Karten nicht doppelt rendern.

---

## Phase 7 – Zukunft (P3, jeweils mit Vorab-Klärung)

- [ ] **7.1 Web Push** (Anwurf, Endergebnis, Verlegung) – vorher klären:
  - Datenschutzerklärung
  - Speicherung der Subscriptions (pseudonym)
  - iOS nur installierte PWA
  - Bedarf nach ICS (3.5) neu bewerten
- [ ] **7.2 Ganze Spieltage einer Liga:** Sync aller Gruppenspiele. Vorher Abstimmung mit dem Verband (Abrufumfang) und Prüfung der Last (`nuliga/client.ts` Mindestabstand).
- [ ] **7.3 Verifizierte Live-Quelle** (nuScoreLive) nach Rechteklärung; `getLiveState` in `match-provider.ts`.
- [ ] **7.4 `src/lib/sources/normalisierung.ts`:** an `SpielAnsicht` anbinden oder entfernen. Fähigkeiten je Quelle explizit machen (`hatHalbzeit`, `hatLiveLink`).

---

## Quick Wins (aus Phase 1–3 vorziehbar, je ≤ ½ Tag)

| # | Aufgabe | Datei |
|---|---|---|
| 1 | H1 bei 360 px nicht überlaufen lassen | `app/page.tsx` |
| 2 | Bottom-Bar auf Mannschaftsseiten | `components/liga/vereins-nav.tsx`, `[team]/layout.tsx` |
| 3 | Tippflächen ≥ 44 px (Stern, Schließen, Bericht/Ticker, Zurück) | `favorit-stern.tsx`, `installieren.tsx`, `liga-ui.tsx`, `[team]/layout.tsx` |
| 4 | `motion-safe:` am Live-Punkt, „vorläufig“ statt „*“ | `liga-ui.tsx`, `meine-mannschaften.tsx` |
| 5 | `flex-auto` an Filter-Chips entfernen | `gefilterte-liste.tsx` |
| 6 | Karten-Link zur Halle | `liga-ui.tsx` |
| 7 | Teilen-Button | neu `teilen-button.tsx` |
| 8 | Deutsche 404 mit Suche | neu `app/not-found.tsx`, `app/verein/[slug]/not-found.tsx` |
| 9 | Status-Badge + Leertext auf `/meine` | `meine-mannschaften.tsx` |
| 10 | `mitAusgang` auf Mannschafts-Ergebnisseiten | `[team]/ergebnisse/page.tsx` |

---

## Offene Entscheidungen für den Betreiber

1. **Zwischenstand:** Zahl verbergen (empfohlen) oder mit Zeitstempel zeigen? (Phase 1.1)
2. **Startseite:** Fan-Einstieg vor Vereinsakquise? (Phase 3.3)
3. **Navigation:** heutige 4 Reiter + „Meine“-Default (geringes Risiko) oder neue Leiste? (Phase 5.8)
4. **Push:** nach ICS überhaupt nötig? (Phase 7.1)
