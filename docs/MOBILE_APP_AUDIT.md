# HandballerPate – Mobile App Audit (öffentliche Fan-App)

Stand: 12.10.2026 · Basis: `main` @ `b5d1d87` · Nur Analyse. Es wurden keine produktiven Komponenten, Schemata oder APIs geändert.

Die Umsetzungsliste steht in [`MOBILE_IMPROVEMENT_ROADMAP.md`](./MOBILE_IMPROVEMENT_ROADMAP.md). Screenshots (375 px, Produktions-Build, synthetische Daten) liegen in [`mobile-audit/`](./mobile-audit/).

---

## 0. Methodik, Kennzeichnung, Einschränkungen

**Kennzeichnung im Text:**
- **[Fakt]**: im Code gelesen oder im Browser gemessen.
- **[Annahme]**: abgeleitet, aber nicht verifiziert.
- **[Vorschlag]**: Empfehlung.

**Vorgehen:**
1. Den Code aller öffentlichen Routen gelesen: `src/app/page.tsx`, `src/app/verein/**`, `src/app/meine/**`, `src/app/api/liga/**`, `src/components/liga/**`, `src/lib/liga-*.ts`, `public/sw.js`.
2. Eine lokale, wegwerfbare Postgres-Instanz migriert. Darin einen synthetischen Verein „TSV Musterstadt“ angelegt: 7 Mannschaften, je 9 Gegner, 70 Spiele (vergangen, ein laufendes, kommende).
3. Die App einmal im Dev-Modus und einmal als **Produktions-Build** (`next build` + `next start`) gestartet.
4. Mit Playwright/Chromium in **vier Smartphone-Größen** angesehen: 360×740, 375×667, 390×844, 430×932. Dabei ausgewertet:
   - Screenshots
   - horizontales Überlaufen
   - Tippflächen unter 32 px
   - Layout-Shift (CLS) und LCP
   - Seitengewichte
5. Zusätzlich ein Lauf mit simuliertem langsamem Netz: 150 ms Latenz, 1,6 Mbit/s, 4× CPU-Drosselung.

**Einschränkungen, ausdrücklich:**
- **Keine echten nuLiga-, handball.net- oder NDR-Daten.** Die Sandbox erreicht die Quellen nicht. Lange Vereins- und Ligennamen, echte Gruppengrößen und echte Logos sind deshalb nicht im Bild.
  - Die Seed-Daten sind zufällig. Punktestände in den Screenshots sind darum inkonsistent (z. B. „Platz 2 · 3:5 Punkte“), Uhrzeiten teils nachts. Das ist kein App-Fehler.
- **Timing-Werte sind nicht repräsentativ für die Produktion.** Die Datenbank lief lokal ohne Netzwerk. In Produktion kommen Neon (eu-central-1), Vercel `fra1`, Cold Starts und Mobilfunk hinzu. Die Werte zeigen nur Größenordnungen und relative Unterschiede.
  - Gewichte von JS und HTML sind unkomprimiert gemessen; gzip ist teilweise nachgerechnet.
- **Kein echtes Gerät.** Safari/iOS (Installations-Flow, Speicherverhalten) wurde nicht getestet. Kein Screenreader-Test.
- **Kein Zugriff auf Nutzungsdaten.** Ob Fans wirklich vor allem „Ergebnisse“ öffnen, ist eine Annahme. Analytics gibt es bewusst nicht.
- **Der Admin- und Funktionsträgerbereich ist nicht Gegenstand dieses Audits.** Er ist eigenständig und in `docs/plan-vereinfachung.md` behandelt. Er wird nur gestreift, wo er Fan-Reisen berührt (Trainer).

---

## 1. Zusammenfassung des aktuellen Entwicklungsstands

HandballerPate besteht aus zwei Produkten in einer Next.js-16-App:

1. **Vereinsverwaltung** (eingeloggt: Admin, Funktionsträger, Systemadmin). Das ist das zahlende Kernprodukt.
2. **Öffentliche Fan-Web-App** unter `/verein/[slug]` und `/meine`. Sie zeigt Spielpläne, Ergebnisse, Tabellen, Statistik und Favoriten für jeden registrierten Verein. Jeder Verein ist als eigene PWA installierbar.

Die Fan-App ist **technisch solide und datenschutzbewusst gebaut**:
- Whitelist-Parser
- keine Konten, Favoriten nur im Gerät
- kein Tracking
- Vereinsfarben, Dark Mode
- sinnvolle Bottom-Bar
- reine, gut getestete Logikfunktionen

Der Stand ist aber noch **„vereinsorientiert“ statt „nutzerorientiert“**. Wer die App öffnet, landet in einem Verein, nicht bei *seinen* Mannschaften. Live- und Statuslogik sowie Navigation haben mehrere Brüche.

### 1.1 Funktionsinventar

| Funktion | Status | Beleg |
|---|---|---|
| Vereinssuche (Startseite, `/verein`) | **funktioniert**; rein clientseitig, nur nach Teilstring im Namen | `components/liga/vereinsuche.tsx` |
| Vereinsseite: Ergebnisse / Spiele / Teams / Statistik | **funktioniert** | `app/verein/[slug]/{page,spiele,mannschaften,statistik}` |
| Mannschaftsseite: Übersicht / Spielplan / Ergebnisse / Tabelle | **funktioniert** | `app/verein/[slug]/[team]/**`, `components/liga/team-tabs.tsx` |
| Filter-Chips (Favoriten / Herren / Damen / Jugend / Kinder) | **funktioniert**; Auswahl nicht in der URL, nicht gespeichert | `components/liga/gefilterte-liste.tsx` |
| Favoriten (Verein + Mannschaft, nur Gerät, Cookie-Spiegel für iOS) | **funktioniert** | `lib/liga-favoriten-lokal.ts`, `components/liga/favorit-stern.tsx` |
| „Meine Mannschaften“ `/meine` | **funktioniert**, aber schmal: kein Status, kein Live, „*“ ohne Legende | `components/liga/meine-mannschaften.tsx`, `api/liga/favoriten/route.ts` |
| PWA je Verein (Manifest, Icons, Install-Hinweis) | **funktioniert** | `lib/liga-pwa.ts`, `components/liga/installieren.tsx` |
| Offline | **teilweise**: nur bereits besuchte Seiten bei vollem Neuladen, keine Offline-Seite | `public/sw.js` |
| Live-Status | **nur Vermutung** (`laeuftVermutlich`), keine Live-Quelle | `lib/liga-spiel-status.ts`, `lib/match-provider.ts` (`getLiveState` nicht implementiert) |
| Live-Ticker- und Spielbericht-Links (nuLiga, NDR) | **funktioniert** | `lib/match-provider.ts` |
| Statistik je Mannschaft (Form, Verlauf, Duelle, Halbzeit) | **funktioniert** | `lib/spiel-statistik.ts`, `components/liga/statistik-karte.tsx` |
| „Diese Woche in Zahlen“ | **funktioniert** | `app/verein/[slug]/page.tsx` |
| Sponsor-Splash | **funktioniert** | `components/liga/sponsor-splash.tsx` |
| Dark Mode | **funktioniert** | `globals.css`, `theme-umschalter.tsx` |
| Gemeinsames Spielmodell `Match` (quellenübergreifend) | **Gerüst, ungenutzt**: `sources/normalisierung.ts` wird nirgends importiert | `src/lib/sources/` |
| Freundschaftsspiele (nuLiga) | **abgeschaltet** (`FREUNDSCHAFTSSPIELE_AKTIV = false`) | `lib/nuliga/sync.ts` |
| Spieltag-Auswahl / ganze Spieltage einer Liga | **nicht vorhanden**; Daten fehlen (nur Spiele eigener Mannschaften gespeichert) | `nuliga/sync.ts` (teamPortrait) |
| Spiel-Detailseite | **nicht vorhanden** | – |
| Teilen (Web Share) | **nicht vorhanden** im öffentlichen Bereich | nur `selbsteintragung-link.tsx` (Admin) |
| Kalender-Abo für Fans (ICS) | **nicht vorhanden**; nur der persönliche Funktionsträger-Feed | `app/kalender/[token]` |
| Push / Spiel-Erinnerung | **nicht vorhanden** | – |
| Zuletzt besuchte Mannschaften | **nicht vorhanden** | – |
| Ladezustände (`loading.tsx`) / eigene 404 (`not-found.tsx`) | **nicht vorhanden**; nur `app/error.tsx` | – |
| Komponenten- und E2E-Tests | **nicht vorhanden**; 97 `*.test.ts` (Logik), 0 `.test.tsx`, kein Playwright-Test | `vitest.config.mts` |

### 1.2 Was gut ist und bleiben sollte
- **Bottom-Bar** auf den Vereinsbereichen: vier Ziele, große Tippflächen (~60 px), `safe-area-inset-bottom`, Spinner während der Navigation (`components/liga/vereins-nav.tsx`).
- **Datenschutz-Architektur**: Whitelist-Parser, Favoriten ohne Konto, kein Tracking. Das ist ein echtes Differenzierungsmerkmal gegenüber werbefinanzierten Sport-Apps.
- **Vereinsfarbe als Theme** (`FanTheme`, `lib/liga-farbe.ts`). Damit fühlt sich jede Vereins-PWA nach „unserem Verein“ an.
- **Reine, getestete Logik** (`liga-spiele-hilfen.ts`, `liga-spiel-status.ts`, `spiel-statistik.ts`). Darauf lässt sich sauber aufbauen.
- **Messbar keine Layout-Shifts** ohne Favoriten (CLS = 0 auf allen gemessenen Seiten). Kein horizontaler Überlauf auf den Fan-Seiten.

---

## 2. Die zehn größten UX/UI-Schwachstellen

Reihenfolge nach Wirkung auf die tägliche Nutzung.

### 1. Live- und Zwischenstand widerspricht Hilfe und Doku (P0)
- **[Fakt]** `SpielKarte` zeigt bei einem Zwischenstand die Zahl, z. B. „14:12“ grau mit „Live“ darunter (`components/liga/liga-ui.tsx:121-130`).
- `/app-hilfe` verspricht Fans dagegen wörtlich: „Wir zeigen bewusst keine Zwischenstände als …“ und „Ergebnis folgt“ (`app/app-hilfe/page.tsx:105-111`). Ebenso `app/hilfe/page.tsx:220-221`, der Kommentar in `lib/liga-spiel-status.ts:45-48` und `CLAUDE.md`.
- Die Texte „Läuft gerade“ und „Ergebnis folgt“ kommen in keiner Komponente vor. Laut `git log -S` gab es sie in dieser Komponente nie.
- **[Fakt]** Zusätzlich inkonsistent: Die Favoriten-API unterdrückt Zwischenstände (`tore: null`, `api/liga/favoriten/route.ts:28-29`). Dasselbe Spiel zeigt also auf der Vereinsseite „14:12“ und auf `/meine` gar nichts.
- Screenshot: `mobile-audit/375-verein.png`.
- **Folge:** Eine stündlich alte Zahl wirkt wie ein Endstand. Die eigene Hilfe ist falsch.
- **Entscheidung nötig:** entweder Code an die Doku anpassen oder Doku an den Code (siehe §10).

### 2. Ein laufendes Spiel erscheint als „Letztes Ergebnis“ und unter „Letzte Ergebnisse“ (P0)
- **[Fakt]** `istVergangen` gilt, sobald Tore vorhanden sind (`lib/liga-spiele-hilfen.ts:23-25`). Ein laufendes Spiel mit Zwischenstand landet deshalb in der Ergebnisliste.
- Auf der Mannschaftsseite steht es unter der Überschrift „Letztes Ergebnis“ (`[team]/page.tsx:30,55`; Screenshot `375-verein_maenner.png`).
- „Diese Woche in Zahlen“ meldet gleichzeitig „14 Spiele, davon 0 gespielt“.
- Es gibt keinen Ort „**Jetzt / Heute**“. Gerade am Spieltag ist das der wichtigste Moment für Fans und Eltern.

### 3. Vergangene Spiele ohne Ergebnis verschwinden komplett (P0)
- **[Fakt]** Ein Spiel mit `datum < heute`, ohne Tore und mit Status `geplant`, `verlegt` oder `abgesagt` ist weder `istVergangen` noch `istAnstehend`. `sammleVereinsSpiele` überspringt es (`lib/liga-spiele-hilfen.ts:89`). Auch Spielplan und Ergebnisse der Mannschaft filtern es heraus.
- **Folge:** Das Spiel von gestern Abend ist bis zum Ergebnis-Eintrag (oft 1–2 Tage später) unsichtbar. Abgesagte Spiele verschwinden am Folgetag.
- Für Eltern wirkt das wie ein Datenfehler („wo ist das Spiel?“).

### 4. Die Startseite spricht Fans nicht an (P1)
- **[Fakt]** Bei 375×667 sieht ein Erstbesucher „Die Vereinsverwaltung für euren Handballspielbetrieb“ und „Jetzt kostenlos registrieren“ (`mobile-audit/375-startseite.png`).
- Die Vereinssuche liegt unterhalb des Folds im Abschnitt `#vereine` (`app/page.tsx:278-293`).
- **[Fakt]** Bei 360 px läuft die H1 horizontal über: „Handballspielbetrieb“ ist ein Wort ohne Silbentrennung, `scrollWidth` 363 > 360 (`mobile-audit/360-startseite.png`).
- **[Fakt]** Wiederkehrende Fans mit Favoriten sehen dieselbe Admin-Werbung. Eingeloggte Trainer werden von `/` nach `/profil` umgeleitet (`app/page.tsx:183-188`) und kommen nie zu Spielplänen.

### 5. Kein persönliches Zuhause (P1)
- `/meine` ist eine Nebenseite, erreichbar über den Textlink „Meine Mannschaften“ im farbigen Kopf.
- Sie zeigt pro Mannschaft nur nächstes und letztes Spiel, ohne Status (verlegt/abgesagt), ohne Live und mit „*“ statt „vorläufig“ (`components/liga/meine-mannschaften.tsx`).
- Ein Verein-PWA startet in `/verein/<slug>?app=1`, nicht bei den eigenen Mannschaften (`lib/liga-pwa.ts:44-46`).
- **Folge:** Ein Elternteil mit zwei Kindern in zwei Mannschaften braucht bei jedem Öffnen mehrere Taps oder Filter.

### 6. Die Mannschaftsseite ist eine Sackgasse (P1)
- **[Fakt]** Auf `/verein/[slug]/[team]` gibt es **keine Bottom-Bar** (`vereins-nav.tsx:21-22` liefert dort `null`).
- Es gibt keinen Wechsel zur nächsten Mannschaft.
- Der Zurück-Link führt immer auf `/mannschaften`, auch wenn man aus „Spiele“ kam (`[team]/layout.tsx:24-30`).
- Der Vereinsname steht dreimal übereinander: Kopf, Zurück-Link und Zeile über der H1 (`375-verein_maenner.png`).
- In einer installierten PWA (`display: standalone`, keine Browser-Zurück-Taste auf iOS) ist der kleine Zurück-Link der einzige Weg zurück.

### 7. Geringe Informationsdichte in Listen (P1)
- **[Fakt]** Auf „Nächste Spiele“ (375×667) beginnt die erste Spielkarte erst bei ~310 px. Davor stehen Kopf (~105 px), H1 mit Stern, zwei Zeilen Filter-Chips und der Tageskopf.
- Eine Karte ist ~120 px hoch, sichtbar sind ~2,5 Spiele (`375-verein_spiele.png`).
- Ursache für die zweite Chip-Zeile: `flex-auto` in `gefilterte-liste.tsx:20` streckt den einzelnen Chip „Kinder“ über die ganze Breite.
- Jeder Tag bekommt eine eigene Überschrift, auch wenn an dem Tag nur ein Spiel ist.

### 8. Tippflächen und kleine Texte (P1)
**[Fakt, gemessen bei 375 px]** Tippflächen unter 32 px Höhe:
- „Spielbericht ↗“ / „Live-Ticker ↗“: 16 px, auf der Ergebnisseite 35-mal
- Mannschaftslinks in der Statistik: 21 px
- „‹ TSV Musterstadt“ (Zurück): 20 px
- „Vereine ansehen“ auf `/meine`: 20 px
- Links in `/app-hilfe`: 18–20 px

**[Fakt, Code]** Weitere zu kleine Elemente:
- Schließen-Button des Install-Hinweises: ca. 16 px (`installieren.tsx:89-96`)
- Favoriten-Stern: 36 px
- Team-Tabs und Filter-Chips: 40 px
- „vorläufig“ und „Live“ in `text-[10px]`

Richtwert sind 44 px (Apple HIG) bzw. 48 dp (Material).

### 9. Fehlende Zustände: Laden, 404, Offline (P1)
- **[Fakt]** Kein `loading.tsx`, kein `not-found.tsx`, kein `global-error.tsx`.
- Ein Tippfehler im Vereins-Slug zeigt die englische Standard-404 von Next.js.
- Die Team-Tabs geben beim Wechsel kein Feedback. Bei schlechtem Hallen-WLAN wirkt die App eingefroren (alle Seiten werden serverseitig neu gerendert, siehe §3.1).
- **[Fakt]** Der Service Worker hat **kein Netz-Timeout** und **keine Offline-Seite** (`public/sw.js`). In einer Halle mit schwachem Netz wartet der Nutzer, bis der Request komplett scheitert, bevor der Cache greift.

### 10. Visuelle Hierarchie und Design-Generik (P2)
- Fast alles ist eine gleich gewichtete `rounded-2xl`-Karte mit Schatten: Ergebnisse, Wochenkarte, Mannschaften, Statistik-Kacheln.
- Wichtig und unwichtig unterscheiden sich kaum. Uppercase-Mini-Überschriften und viele Pill-Chips sind typische shadcn- bzw. KI-Standardmuster.
- Der Spielstand ist nur `text-xl`, also kaum größer als die Teamnamen. In einer Sport-App ist er das wichtigste Element.
- Sieg, Unentschieden und Niederlage werden nur als farbiger Rand gezeigt (`liga-ui.tsx`, `mitAusgang`). Das ist für Farbfehlsichtige nicht lesbar und auf Mannschafts-Ergebnisseiten gar nicht aktiv (inkonsistent).
- Gegner haben keine visuelle Identität (keine Initialen, kein Logo).
- Die Tabelle zeigt auf Mobile keine Tordifferenz und keine Form (`375-verein_maenner_tabelle.png`).

**Weitere kleinere Befunde (in der Roadmap berücksichtigt):**
- **Favoriten-Filter springt nach der Hydration.** Server-HTML ohne Favoriten, dann Chip-Zeile plus Wechsel auf „Favoriten“ (`gefilterte-liste.tsx:30-35`, `useSyncExternalStore` mit leerem Server-Snapshot). [Annahme: CLS > 0 bei Nutzern mit Favoriten; ohne Favoriten gemessen = 0]
- **`/mannschaften`** rendert favorisierte Karten doppelt.
- **`StandHinweis`** nennt fest „nuLiga (Hessischer Handball-Verband)“ (`liga-ui.tsx:214`). Das ist ein Problem, sobald weitere Landesverbände hinzukommen (heute ist nur `HHV` in `nuliga/verbaende.ts`).
- **Sponsor-Splash:** `role="dialog"` ohne `aria-modal` und ohne Fokusführung.
- **`FormChips`:** `aria-label` an einem `div` ohne Rolle.
- **Live-Punkt:** `animate-pulse` ohne `motion-safe:`.
- **`/app-hilfe`** hat weder Fan-Kopf noch Theme und wirkt wie eine andere App.
- **Datumsformat:** in langer Form ohne „Uhr“, in kurzer mit „Uhr“.

---

## 3. Technische Auffälligkeiten

### 3.1 Alle öffentlichen Seiten werden bei jedem Aufruf dynamisch gerendert
- **[Fakt]** Der Build weist **jede** Route als `ƒ (Dynamic)` aus, auch `/app-hilfe`, `/impressum` und `/datenschutz`. Statisch sind nur `/icon.png`, `/robots.txt` und `/llms.txt`.
- **[Fakt]** Ursache ist der globale `<Footer>`: er ruft `await auth()` auf (`components/footer.tsx:15`) und hängt am Root-Layout. `auth()` liest Cookies, deshalb ist der gesamte Baum dynamisch.
  - Das Vorschau-Cookie ist **nicht** die Ursache. `cookies()` läuft nur bei Vereinen in `vorbereitung`.
- **[Fakt]** Auf den Fan-Routen gibt es kein `revalidate`, kein `'use cache'` und kein `unstable_cache`. Die Daten ändern sich höchstens stündlich durch den Cron.
- **[Fakt, Code]** Kosten pro Seitenaufruf auf `/verein/[slug]/**`:
  - ≈ 10–12 DB-Abfragen, davon ~6 nacheinander (`holeVerein` → Status → Hauptjoin → Tabelle/Spiele → Freundschaftsteilnahmen → Freundschaftsspiele)
  - Layout zusätzlich: Design → Vorschau → Sponsor, nacheinander
  - `holeMannschaften` lädt alle Spiele und Tabellenzeilen des ganzen Vereins, auch für eine einzelne Mannschaftsseite
- **[Gemessen, lokal]** TTFB 36–102 ms ohne Netzlatenz zur DB.
- **[Annahme]** In Produktion ergeben 6 serielle Round-Trips zu Neon gut 50–150 ms plus Cold Start (siehe `CLAUDE.md`: „Neon fährt nach Inaktivität herunter“). Jeder Tab-Wechsel zahlt das erneut.

### 3.2 N+1-Muster
- **[Fakt]** `/api/liga/favoriten` ruft für jeden favorisierten Verein nacheinander `holeMannschaften` auf (4–5 Abfragen je Verein, lädt die ganze Saison).
  - 10 Favoriten aus 10 Vereinen ≈ 50 serielle Abfragen.
  - Der CDN-Cache (`s-maxage=60`) greift kaum, weil die Query-Strings je Nutzer verschieden sind.
- **[Fakt]** `app/sitemap.ts` ruft `holeMannschaften` je Verein nacheinander auf (`force-dynamic`).

### 3.3 Gewicht und Rendering (gemessen, Produktions-Build, 390 px)

| Seite | HTML (roh / gzip) | JS (roh) | Requests | FCP lokal | FCP gedrosselt* |
|---|---|---|---|---|---|
| `/` | 83 kB | 611 kB | 23 | 464 ms | 908 ms |
| `/verein/[slug]` (Ergebnisse) | 284 kB / ~15 kB | 530 kB | 30 | 208 ms | 952 ms |
| `/spiele` | 214 kB | 514 kB | 30 | 144 ms | 920 ms |
| `/mannschaften` | 102 kB | 512 kB | 40 | 140 ms | 904 ms |
| `/[team]` | 48 kB | 513 kB | 34 | 108 ms | 884 ms |
| `/meine` | 21 kB | 531 kB | 27 | 84 ms | 884 ms |

\*150 ms Latenz, 1,6 Mbit/s, CPU 4×. CLS war auf allen Seiten 0 (ohne Favoriten).

- **[Fakt]** Das HTML der Ergebnisseite ist mit 284 kB groß. Die 40 Karten stehen doppelt drin: als HTML und als RSC-Payload für `GefilterteListe`. Gzip reduziert auf ~15 kB, daher **unkritisch**.
- **[Fakt]** Rund 510 kB unkomprimiertes JS auf jeder Fan-Seite. Der größte Chunk hat 230 kB (gzip 72 kB) und ist überwiegend React/Next. Kein Ausreißer, aber auch kein Spielraum.
  - `Geist_Mono` wird global geladen (`app/layout.tsx`), obwohl die Fan-Seiten es nicht brauchen.
- **[Annahme]** Auf Mittelklasse-Android dominiert die Hydration (510 kB JS) die Interaktivität stärker als das HTML.

### 3.4 Service Worker und PWA
- **[Fakt]** `public/sw.js` arbeitet **network-first** ohne Timeout und cacht nur HTML-Navigationen und `/api/liga/*`.
  - RSC-Requests werden nicht gecacht, statische Chunks und Fonts nicht vorgeladen.
  - Der Cache ist FIFO mit 60 Einträgen, die Version ist eine manuelle Konstante.
  - Offline funktioniert nur ein vollständiges Neuladen bereits besuchter URLs. Client-Navigation (`<Link>`) scheitert. [Annahme, nicht auf Gerät getestet]
- **[Fakt]** Alle Manifeste haben `scope: "/"` (`lib/liga-pwa.ts`, `public/manifest.json`). Mehrere installierte Apps (Verein A, Verein B, „Meine“, Verwaltung) überlappen sich, und eine Vereins-PWA kann in den Admin-Bereich navigieren.
- **[Fakt]** Die Icon-Route rechnet bei jedem Aufruf mit `sharp` aus dem bytea-Logo (`verein/[slug]/icon/[groesse]/route.tsx`). Die Antwort trägt `max-age=86400`, aber kein `s-maxage`, ist also nicht im Edge-Cache.

### 3.5 Daten und Konsistenz zwischen Ligen
- **[Fakt]** Gespeichert sind **nur Spiele der eigenen Mannschaften**:
  - nuLiga: `teamPortrait`
  - handball.net: Abfrage je Team
  - NDR: `meine.has(...)`

  Die Tabelle einer Gruppe ist vollständig (`liga_tabellenzeile`). Eine Spieltag-Ansicht oder „alle Spiele der Liga“ geht damit **nicht ohne Sync-Erweiterung**. Die bräuchte mehr Abrufe und ist mit der HHV-Zusage abzugleichen.
- **[Fakt]** Hallen haben nur einen Namen, keine Adresse (`liga_spiel.halle_name/_nummer/_nuliga_id`). Ein Karten-Link ist nur als Suche nach dem Hallennamen möglich.
- **[Fakt]** Gegnerlogos gibt es nur für NDR (`liga_externe_identitaet.logo_url`).
- **[Fakt]** `src/lib/sources/normalisierung.ts` (das gemeinsame `Match`-Modell) wird nicht benutzt. Die Seiten lesen `liga_spiel` direkt, quellenspezifisch ist nur `match-provider.ts`.
  - Unterschiede je Quelle: Halbzeit gibt es nur bei nuLiga und NDR, Live nur über nuLiga-`meeting_id`, handball.net nie „Live“.
  - **[Vorschlag]** Für die geplante Ausweitung auf mehr Ligen sollte `SpielAnsicht` der eine Vertrag bleiben, mit Fähigkeiten je Quelle (`hatHalbzeit`, `hatLiveLink`). Ein zweites Modell parallel sollte es nicht geben.

### 3.6 Suche
- **[Fakt]** `holeAlleVereine()` lädt alle aktiven Vereine ohne Limit in die Client-Komponente. Gefiltert wird mit `name.toLowerCase().includes(q)`.
  - Keine Umlaut- oder Abkürzungstoleranz („TSV“ ≠ „Turn- und Sportverein“), keine Suche nach Ort oder Mannschaft.
- Bei der heutigen Vereinszahl (Beta-Limit) ist das schnell. Ab einigen hundert Vereinen sollte es serverseitig mit Index laufen.

### 3.7 Tests
- **[Fakt]** Die reine Logik ist gut abgedeckt (u. a. `liga-spiele-hilfen`, `liga-spiel-status`, `spiel-statistik`, `liga-pwa`, `liga-favoriten-parse`).
- Es gibt **keinen** Test für die Favoriten-API, für Manifest-, Icon- und Logo-Routen, für `sw.js`, für Komponenten oder für Seiten.
- Playwright ist installiert, wird aber nur für Produkttour-Screenshots genutzt. Die Befunde 1–3 aus §2 wären mit einem Test auf `SpielKarte` bzw. `sammleVereinsSpiele` aufgefallen.

---

## 4. Nutzerreisen

### 4.1 Elternteil: „Wann ist das nächste Spiel meines Kindes?“

**Heute (Erstbesuch, z. B. Link aus der Eltern-WhatsApp-Gruppe auf die Startseite):**
1. `/` öffnen, Admin-Hero sehen
2. scrollen oder „Euren Verein als App finden“ tippen
3. Verein tippen, man landet auf „Letzte Ergebnisse“
4. „Teams“ tippen
5. „männliche Jugend D“ suchen und tippen
6. „Nächstes Spiel“ lesen

Das sind **5 Taps plus Scrollen**. Wiederkehrend mit Favorit: Vereins-PWA öffnen, „Spiele“ tippen, Filter steht auf „Favoriten“, erstes Spiel lesen. Das sind 1–2 Taps.

**Probleme:**
- Fan-Einstieg unter dem Fold.
- Die Mannschaft heißt auf nuLiga oft anders als in der Familie („D2“, „mJD“).
- Kein Hinweis auf „heute/morgen“.
- Die Halle ist nur ein Name, kein Karten-Link.
- Kein „In Kalender übernehmen“.
- Spiele von gestern ohne Ergebnis verschwinden (§2.3).

**Verbesserung:**
- Fan-Suche als erstes Element der Startseite.
- Nach dem ersten Stern wird `/meine` die Startansicht.
- Karte „Nächstes Spiel“ mit relativer Zeit („Sa, 18.10. · 13:30 · in 6 Tagen“), Karten-Link zur Halle und Buttons „Kalender“ und „Teilen“.
- Kalender-Abo je Mannschaft (ICS), damit sich die Frage nicht mehr stellt.

**Umsetzbar:**
- Daten sind vorhanden (`datum`, `uhrzeit`, `halle_name`).
- Für ICS gibt es mit `/kalender/[token]` schon ein Muster für eine Route.
- Karten-Link als `https://www.google.com/maps/search/?api=1&query=<Hallenname>` bzw. `maps.apple.com`: es werden keine Daten gespeichert, es ist nur ein Link.

### 4.2 Spieler: „Aktuelle Tabelle meiner Liga“

**Heute:** Vereins-PWA → „Teams“ → Mannschaft → Tab „Tabelle“. Das sind **3 Taps**. Die Tabelle ist gut lesbar (eigene Zeile hervorgehoben).

**Probleme:**
- Keine Tordifferenz auf Mobile, keine Form-Spalte.
- Lange Gegnernamen werden bei 13rem abgeschnitten.
- Keine Legende für Auf- und Abstiegsplätze. Die Daten fehlen auch.
- Wer nur die Tabelle will, muss über die Übersicht gehen.

**Verbesserung:**
- Tabellen-Snippet auf der Übersicht: die eigene Zeile ±2 Plätze und „ganze Tabelle →“.
- `+/-`-Spalte statt „Tore“ auf schmalen Geräten, Tore per Tippen auf die Zeile.
- Deep-Link `/[team]/tabelle` als Shortcut im Manifest (`shortcuts`).

**Umsetzbar:** Alles aus `liga_tabellenzeile`. Keine Schemaänderung.

### 4.3 Fan: „Ergebnisse meines Lieblingsvereins“

**Heute:** Vereins-PWA öffnen, die Startseite *ist* „Letzte Ergebnisse“. **0 Taps.** Das ist gut gelöst.

**Probleme:**
- Laufende Spiele stehen mit grauer Zahl zwischen den Ergebnissen.
- Ergebnisse älter als 40 Spiele sind vereinsweit nicht erreichbar (kein „Mehr laden“).
- Auf Mannschafts-Ergebnisseiten fehlt die Sieg- bzw. Niederlage-Kennzeichnung.
- Nur ~2,5 Ergebnisse pro Bildschirm.
- Kein Teilen eines Ergebnisses (z. B. in die Vereins-WhatsApp).

**Verbesserung:**
- Bereich „Heute“ oben (live, gleich, Ergebnis folgt).
- Kompaktere Ergebniszeilen mit S/U/N als Buchstabe *und* Farbe.
- „Ältere laden“.
- Teilen-Button (`navigator.share` mit Text „TSV Musterstadt – HSG Waldtal 28:25 (Männer, Landesliga)“ und Link).

**Umsetzbar:** Ja, rein im Frontend und in reiner Logik.

### 4.4 Trainer: „Kommenden Spieltag prüfen“

**Heute:**
- Trainer haben meist ein Konto (Funktionsträger). Eingeloggt leitet `/` nach `/profil` um (`app/page.tsx:183-188`), die Fan-Ansicht der eigenen Mannschaft ist von dort nicht verlinkt.
- Anonym (oder über die Vereins-PWA): „Spiele“ → Filter „Herren“ → scrollen. Vereinsweit gibt es keinen Filter für **eine** Mannschaft, nur Kategorien.
- Die Ansetzung (Schiedsrichter, Zeitnehmer) ist bewusst nur im privaten Bereich.

**Probleme:**
- Zwei getrennte Welten (Profil vs. Fan-App).
- Kein Wochenende-im-Überblick („Sa: 3 Spiele, So: 4 Spiele, 2 Heimspiele in eigener Halle“).
- Trainer prüfen typischerweise auch den Gegner (Tabellenplatz, letzte Ergebnisse). Das ist nur über die Tabelle möglich, ohne Gegner-Form.

**Verbesserung:**
- Im Profil eine Karte „Meine Mannschaft öffentlich“ mit Link auf `/verein/[slug]/[team]` (Zuordnung `mannschaft.liga_mannschaft_id` existiert).
- In der Fan-App ein „Wochenende“-Abschnitt auf „Spiele“ (Spiele bis Sonntag gruppiert, Heimspiele markiert).
- Auf der Spielkarte „Gegner: Platz 4, Form S S N“ aus `liga_tabellenzeile`. Die Form des Gegners geht nur aus Spielen gegen eigene Teams, deshalb nur den Platz zeigen.

**Umsetzbar:** Profil-Link einfach. Gegner-Platz einfach, die Daten sind im selben Query.

### 4.5 Neuer Nutzer: „Verein finden und als Favorit speichern“

**Heute:**
1. `/` öffnen, scrollen oder Pill tippen
2. tippen
3. Verein tippen
4. Stern neben „Letzte Ergebnisse“ tippen

Das sind **3–4 Taps**. Der Stern ist 36 px groß, ohne Bestätigung, und neben einer H1 versteckt.

**Probleme:**
- Der Stern bedeutet „Verein favorisieren“. Eigentlich will der Nutzer aber eine *Mannschaft* folgen.
- Kein Feedback („Gespeichert – findest du unter Meine“).
- Kein Onboarding, das nach der Mannschaft fragt.
- Die Suche findet nur Vereinsnamen.

**Verbesserung:**
- Folgen-Button mit Text („☆ Folgen“ → „★ Folge ich“) statt nacktem Stern.
- Nach dem ersten Folgen ein kurzer Toast mit Link „Zu Meine Mannschaften“.
- Auf der Vereinsseite beim ersten Besuch ein dezenter Hinweis „Welche Mannschaft interessiert dich?“ mit Chip-Liste der Mannschaften. Einmalig, wegtippbar, nur localStorage.
- Suche toleriert Umlaute und Abkürzungen (`normalisiere()`: ä→ae, „turn- und sportverein“→„tsv“ als Alias).

**Umsetzbar:** Ja, clientseitig. Keine Schemaänderung.

### 4.6 Wiederkehrender Nutzer: „Alles Relevante auf einen Blick“

**Heute:** `/meine` öffnen (über den Kopf-Link oder als eigene installierte App „Meine Mannschaften“). Je Mannschaft eine Karte mit nächstem und letztem Spiel. Vereinsfavoriten zeigen die nächsten 3 Spiele.

**Probleme:**
- Keine Zeitachse über alle Favoriten (heute, dieses Wochenende, letzte Ergebnisse).
- Kein Live und kein Status (verlegt/abgesagt), „*“ ohne Legende.
- Leere API-Antwort ergibt eine leere Seite ohne Text.
- Lädt sequenziell (N+1, §3.2).
- „Lädt…“ als reiner Text, kein Skeleton.

**Verbesserung:** `/meine` wird zum **Home-Dashboard** (Wireframe §7.3):
1. **Jetzt** (live, Ergebnis folgt)
2. **Als Nächstes** (die nächsten Spiele aller Favoriten, chronologisch)
3. **Neue Ergebnisse seit dem letzten Besuch**, Marker in localStorage
4. **Meine Mannschaften** als horizontale Karten mit Platz und Form

**Umsetzbar:**
- Daten vorhanden.
- API umbauen: eine Abfrage über alle IDs statt `holeMannschaften` je Verein.
- „Seit letztem Besuch“ rein lokal, also kein Tracking.

---

## 5. Neue funktionale Ideen (mit Nutzen- und Datenprüfung)

| Idee | Nutzen für HandballerPate (warum gerade hier) | Daten / Technik vorhanden? | Bewertung |
|---|---|---|---|
| **Home-Dashboard „Meine“** (Jetzt / Als Nächstes / Neue Ergebnisse) | Der häufigste Grund, die App zu öffnen, ist eine bestimmte Mannschaft. Heute liegt sie 2–4 Taps entfernt. | ja; API-Umbau nötig | **P1** |
| **„Heute“-Bereich auf der Vereinsseite** | Spieltage sind die Spitzen der Nutzung. Laufende und eben beendete Spiele brauchen einen eigenen Ort. | ja (`spielPhase`) | **P0/P1** |
| **Kalender-Abo je Mannschaft (ICS, öffentlich)** | Eltern planen über ihren Handy-Kalender. Verlegungen kommen dann automatisch an, ohne Push-Infrastruktur und ohne Personendaten. Für HandballerPate ein starkes Bindungsmerkmal mit sehr geringem Datenschutzrisiko. | ja; Muster in `app/kalender/[token]`, Daten in `liga_spiel` | **P1** |
| **Teilen** (Ergebnis, Spiel, Mannschaft) | Verbreitung über Vereins-WhatsApp-Gruppen ist der realistische Wachstumskanal. Jeder geteilte Link bringt neue Fans auf eine Vereins-PWA. | ja (`navigator.share`, Fallback Kopieren) | **P1** |
| **Karten-Link zur Halle** | Eltern fahren zu Auswärtsspielen in fremde Hallen. | nur Hallenname; Link als Suchanfrage, keine Speicherung | **P1 (Quick Win)** |
| **Mannschaftswechsel auf der Teamseite** | Eltern mit mehreren Kindern, Trainer mehrerer Teams | ja (`holeMannschaften` liefert alle) | **P1** |
| **Gegner-Kurzinfo auf der Spielkarte** („Platz 4“) | Einordnung des Spiels ohne Tabellenwechsel | ja (`liga_tabellenzeile`) | **P2** |
| **Zuletzt besucht** (localStorage, max. 5) | Nutzer ohne Favoriten (Gelegenheitsfans) finden zurück | ja, rein clientseitig | **P2** |
| **Manifest-Shortcuts** (Spiele, Tabelle, Meine) | Long-Press aufs App-Icon führt direkt zum Ziel (Android, teils iOS) | ja | **P2 (Quick Win)** |
| **„Seit deinem letzten Besuch“-Badge** | Grund zum Wiederkommen, ohne Push | ja, localStorage | **P2** |
| **Spiel-Detailseite** (Halbzeit, Verlauf beider Teams, Duell-Historie, Halle, Links) | Ein Ziel für geteilte Links und Suchmaschinen (JSON-LD existiert schon) | teilweise; Duelle und Halbzeit vorhanden | **P2** |
| **Push-Benachrichtigungen** (Anwurf, Endergebnis, Verlegung) | Hoher Bindungswert. Aber: iOS nur für installierte PWAs (ab 16.4). Braucht Web Push mit VAPID und einer Tabelle für Subscriptions (pseudonym, trotzdem Datenschutzerklärung und AVV-Prüfung). Ergebnisse kommen nur stündlich, deshalb kein „Tor“-Push. | Infrastruktur fehlt | **P3**; erst nach ICS prüfen, ob noch nötig |
| **Spieltag-Ansicht der ganzen Liga** | Für Spieler und Fans interessant („wie haben die anderen gespielt?“) | **nein**: nur eigene Spiele gespeichert; Sync-Erweiterung plus Abstimmung mit dem Verband | **P3** |
| **Echter Live-Spielstand** | Höchster Reiz, aber keine verifizierte Quelle (nuScoreLive-Endpunkt unbekannt, `getLiveState` offen) | **nein** | **P3**; vorher Nutzungsrechte klären |
| **Saisonübergreifende Historie / Archiv** | Nett, aber selten genutzt | Daten je Saison vorhanden | **P3** |
| **Eigene Idee: „Spieltags-Karte“ zum Teilen** (Bild mit allen Ergebnissen des Wochenendes im Vereinsdesign) | Vereine posten heute Ergebnisse händisch auf Instagram. Ein generiertes Bild (`ImageResponse`, wie bei den Icons) spart Arbeit und trägt die Marke „HandballerPate“ in Vereinskanäle. | ja (`next/og` wird schon genutzt) | **P2**; hoher Hebel fürs Wachstum |
| **Eigene Idee: Hallen-Hinweis bei Heimspielen** („Heimspiel – Sporthalle am Park“) | Fans wissen sofort, ob sie hinfahren können | ja (`eigene_hallen_namen`) | **P2** |

**Bewusst nicht empfohlen** (Nutzen für HandballerPate gering oder kontraproduktiv):
- Benutzerkonten für Fans: widersprechen dem Datenschutz-Prinzip; die Favoriten funktionieren ohne Konto.
- Kommentar- oder Chat-Funktionen: Moderationsaufwand, Jugendschutz.
- Wettquoten.
- Allgemeine Handball-News: keine Quelle, kein Fokus.

---

## 6. Vorschlag für eine verbesserte mobile Navigation

### 6.1 Prinzipien
1. **Ein Zuhause für den Nutzer** (Meine), **ein Zuhause für den Verein** (Vereinsseite).
2. **Die Bottom-Bar ist überall sichtbar**, auch auf Mannschaftsseiten. Kontext ist der Verein.
3. **Maximal 2 Taps** von App-Start zu „nächstes Spiel meiner Mannschaft“ und zur „Tabelle meiner Mannschaft“.
4. **Zurück heißt Zurück** (Historie), nicht „immer zu /mannschaften“. Fallback ist die Vereinsseite.

### 6.2 Bottom-Bar (Vereins-PWA), 4 Ziele

```
┌──────────┬──────────┬──────────┬──────────┐
│  ★ Meine │  ⏱ Spiele │ 👥 Teams  │ 📊 Tabellen│
└──────────┴──────────┴──────────┴──────────┘
```

| Heute | Vorschlag | Begründung |
|---|---|---|
| Ergebnisse | **Spiele** (ein Ziel mit Umschalter „Kommend / Ergebnisse“, Startposition „Heute“) | Vergangen und kommend sind *eine* Zeitachse. Zwei Reiter teilen künstlich und verstecken „heute“. |
| Spiele | → in „Spiele“ aufgegangen | |
| Teams | **Teams** (unverändert) | |
| Statistik | **Tabellen** (Tabellen aller Mannschaften + Statistik als Abschnitt) | Tabellen werden häufiger gebraucht als Statistik [Annahme]. Die Statistik bleibt erreichbar. |
| – | **Meine** (links, Start bei Favoriten) | Persönlicher Einstieg. Ohne Favoriten zeigt es die Vereinsübersicht mit „Folge deinen Mannschaften“. |

**[Alternative, geringeres Risiko]**
- Die vier heutigen Reiter bleiben.
- „Meine“ kommt als **Filter-Default** hinzu (existiert schon über den Favoriten-Chip).
- Auf Mannschaftsseiten wird die Bottom-Bar trotzdem angezeigt.

Damit fallen die Brüche weg, ohne die URL-Struktur zu ändern. Die URLs `/spiele`, `/mannschaften` und `/statistik` bleiben in beiden Varianten erhalten (Weiterleitungen nicht nötig).

### 6.3 Mannschaftsseite
- Kopf kompakt: `‹` (zurück) · Mannschaftsname · `★ Folgen`. Darunter Liga und Platz als **eine** Zeile. Der Vereinsname erscheint nur einmal.
- **Mannschafts-Wechsler:** Tippen auf den Namen öffnet ein Bottom-Sheet mit allen Mannschaften, Favoriten oben.
- Tabs bleiben (Übersicht · Spiele · Tabelle). „Spielplan“ und „Ergebnisse“ werden zu „Spiele“ mit Segment-Umschalter, wie auf Vereinsebene.

### 6.4 Seitenhierarchie (Soll)
```
/                      Fan-Einstieg: Suche oben; mit Favoriten → „Weiter zu Meine“
/meine                 Home-Dashboard (Jetzt · Als Nächstes · Neue Ergebnisse · Meine Teams)
/verein                Vereinsliste + Suche
/verein/[slug]         Verein: Heute + Spiele (Umschalter kommend/Ergebnisse)
  /mannschaften        Teams
  /statistik           Tabellen & Statistik
  /[team]              Mannschaft: Übersicht · Spiele · Tabelle
/app-hilfe             im Fan-Design, aus jeder Fan-Seite erreichbar
```
Der Admin-Einstieg bleibt über „Login“ oben rechts und den Footer.

---

## 7. Designkonzept

### 7.1 Leitidee: „Anzeigetafel + Vereinsfarbe“
Eine eigene Identität entsteht nicht aus mehr Karten, sondern aus **einem starken, wiedererkennbaren Element**: dem **Spielstand als Anzeigetafel**.
- Große, tabellarische Ziffern, `font-heading`, `tabular-nums`, 28–32 px.
- Klare Zeilen für Heim und Gast.
- Die Vereinsfarbe als dünner Akzent, nicht als Fläche.

**Typografie:**
- Plus Jakarta Sans (Überschriften, Ziffern) und Geist (Text) bleiben, sie sind schon geladen.
- Ziffern immer `tabular-nums`.
- Mindestgröße 12 px. `text-[10px]` und `text-[11px]` entfallen.

**Farbe:**
- Vereinsfarbe (`--primary` aus `FanTheme`) nur für aktive Navigation, eigene Zeilen und Links.
- Status hat eigene Farben, unabhängig von der Vereinsfarbe:

| Status | Farbe | Darstellung |
|---|---|---|
| Live | Rot `rose-600` | Punkt + Text |
| Ergebnis folgt | Amber | Text |
| Sieg / Unentschieden / Niederlage | Grün / Grau / Rot | **immer mit Buchstabe S/U/N** |
| Verlegt / Abgesagt | Outline | Text, Datum durchgestrichen + neues Datum |

**Fläche:**
- Listen als **gruppierte Zeilen** in *einer* Karte je Tag (iOS-Settings-Prinzip) statt eine Karte je Spiel.
- Schatten nur für schwebende Elemente (Bottom-Bar, Sheet).
- Ergibt ~2× Dichte.

**Bewegung, dezent und immer `motion-safe:`:**
- Live-Punkt pulsiert.
- Segment-Umschalter gleitet.
- Stern springt beim Folgen kurz (scale 1 → 1,2 → 1).
- Bottom-Sheet fährt ein.
- View Transitions zwischen Tabs nur, wenn die Next-16-Doku sie stabil unterstützt (vorher `node_modules/next/dist/docs/` lesen, siehe `AGENTS.md`).

**Dark Mode:** existiert schon (`.dark`, `.dark .fan`). Neue Komponenten verwenden nur Tokens.

**Gegner-Identität:** Initialen-Avatar (vorhandene Logik `vereinsInitialen`) mit neutralem Farbton aus dem Namen gehasht. Logos nur, wo vorhanden (eigener Verein, NDR).

### 7.2 Match-Card (Spielzeile) – Varianten

```
Kommend (in einer Tagesgruppe)
┌─────────────────────────────────────────────┐
│ 13:30   (TM) TSV Musterstadt          Heim  │
│         (TN) TV 1887 Neuhof           Pl. 5 │
│         Männer · Sporthalle am Park  ↗Karte │
└─────────────────────────────────────────────┘

Live
┌─────────────────────────────────────────────┐
│ ● LIVE  (HK) HSG Kreuztal/Dorfweil          │
│ seit    (TM) TSV Musterstadt                │
│ 19:00   Läuft gerade · Live-Ticker ↗        │  ← keine Zahl (oder Zahl + „Stand 19:40“,
└─────────────────────────────────────────────┘     siehe Entscheidung §10)

Ergebnis
┌─────────────────────────────────────────────┐
│ S │ (HW) HSG Waldtal                 25     │
│   │ (TM) TSV Musterstadt             28     │  ← 28–32 px, fett beim Sieger
│   │ Männer · HZ 12:15 · Bericht ↗   Teilen  │
└─────────────────────────────────────────────┘
  └ farbiger Rand + Buchstabe S/U/N (barrierefrei)

Verlegt / Abgesagt
┌─────────────────────────────────────────────┐
│ [Verlegt] Sa 17.10. → So 25.10. 15:00       │
│ ...                                         │
└─────────────────────────────────────────────┘
```

**Regeln:**
- Ganze Zeile tippbar, später zur Spiel-Detailseite.
- Externe Links als eigene Schaltflächen mit mindestens 44 px Höhe in einer Fußzeile, nicht als 16-px-Text.

### 7.3 Home-Dashboard `/meine` (390 px)

```
┌───────────────────────────────────┐
│ HandballerPate            ⚙︎  🔍   │
│ Meine Mannschaften                │
├───────────────────────────────────┤
│ JETZT                             │
│ ┌───────────────────────────────┐ │
│ │ ● LIVE  mJD · seit 10:00      │ │
│ │ TSV Musterstadt – HSG Waldtal │ │
│ │ Läuft gerade · Ticker ↗       │ │
│ └───────────────────────────────┘ │
│ ALS NÄCHSTES                      │
│ ┌───────────────────────────────┐ │
│ │ Sa 18.10. 13:30 · in 6 Tagen  │ │
│ │ Männer  vs TV 1887 Neuhof  🏠 │ │
│ │ [📅 Kalender] [↗ Karte] [Teilen]│
│ ├───────────────────────────────┤ │
│ │ So 19.10. 11:00 · wJC @ Bergh.│ │
│ └───────────────────────────────┘ │
│ NEU SEIT DEINEM LETZTEN BESUCH (2)│
│ ┌───────────────────────────────┐ │
│ │ S  Männer   28:25 HSG Waldtal │ │
│ │ N  wJC      14:19 TV Bergheim │ │
│ └───────────────────────────────┘ │
│ MEINE TEAMS          (scroll →)   │
│ [Männer Pl.2 SSUNS][wJC Pl.4 ...] │
├───────────────────────────────────┤
│  ★Meine   Spiele   Teams  Tabellen│
└───────────────────────────────────┘
```

### 7.4 Vereinsseite „Spiele“ mit Heute-Bereich

```
┌───────────────────────────────────┐
│ (TM) TSV Musterstadt      ★ Folgen│  ← Kopf 56 px statt ~105 px
├───────────────────────────────────┤
│ [ Kommend | Ergebnisse ]  Filter ▾│  ← Segment + EIN Filter-Button (Sheet)
│ HEUTE                             │
│  ● LIVE  Männer  … (Zeile)        │
│  18:00   Frauen  … (Zeile)        │
│ SAMSTAG 18.10.                    │
│  11:00  mJD  …                    │
│  13:30  Männer …                  │
│  15:30  Männer II …               │
│ SONNTAG 19.10.                    │
│  …                                │
├───────────────────────────────────┤
│  ★Meine   Spiele   Teams  Tabellen│
└───────────────────────────────────┘
```

Sichtbar bei 375×667: ~6 Spiele statt heute ~2,5.

Der Filter wird **ein** Button, der ein Sheet öffnet: Favoriten, Kategorien, einzelne Mannschaft. Das spart die zweite Chip-Zeile und erlaubt die Auswahl *einer* Mannschaft.

### 7.5 Mannschaftsseite

```
┌───────────────────────────────────┐
│ ‹   Männer ▾                ★     │  ← ▾ öffnet Team-Wechsler (Sheet)
│     Landesliga Nord · Platz 2     │
│ [Übersicht] [Spiele] [Tabelle]    │
├───────────────────────────────────┤
│ NÄCHSTES SPIEL                    │
│  Sa 18.10. 13:30 · vs TV Neuhof 🏠│
│  [📅] [↗ Karte] [Teilen]           │
│ LETZTES ERGEBNIS                  │
│  S  28:25 HSG Waldtal (A)         │
│ TABELLE (Ausschnitt)              │
│  1 HSG Kreuztal      6  +17  7:5  │
│  2 TSV Musterstadt   4  −23  3:5 ◀│
│  3 HSG Waldtal       5   −1  1:9  │
│  ganze Tabelle →                  │
│ FORM  S S U N S                   │
├───────────────────────────────────┤
│  ★Meine   Spiele   Teams  Tabellen│
└───────────────────────────────────┘
```

### 7.6 Startseite `/` (Fan-first, Admin-Teil bleibt)

```
┌───────────────────────────────────┐
│ (Logo) HandballerPate      Login  │
│ Spielpläne, Ergebnisse, Tabellen  │
│ deines Handballvereins.           │
│ ┌─────────────────────────────┐   │
│ │ 🔍 Verein oder Ort suchen    │   │  ← erstes interaktives Element
│ └─────────────────────────────┘   │
│ (mit Favoriten:) [Weiter zu Meine]│
│ ─────────────────────────────     │
│ Für Vereine: Verwaltung für       │
│ Funktionsträger …  [Registrieren] │
│ …(bisheriger Inhalt)…             │
└───────────────────────────────────┘
```

**Hinweis:** Die Startseite ist auch Vertriebsseite für Vereine (Beta-Plätze, Preise). Der Vorschlag stellt den Fan-Einstieg nach oben, ohne den Vereinsteil zu entfernen. Die Gewichtung ist eine **Produktentscheidung des Betreibers**.

---

## 8. Priorisierte Roadmap

Aufwand: S ≤ 1 Tag, M 2–4 Tage, L ≥ 1 Woche. Risiko bezieht sich auf Regressionen und Nebenwirkungen.

| Prio | Bereich | Problem | Verbesserung | Nutzen | Aufwand | Risiko |
|---|---|---|---|---|---|---|
| **P0** | Spielstatus | Zwischenstand als Zahl entgegen Hilfe/Doku (§2.1) | Entscheidung treffen, dann Code **oder** Hilfe angleichen; Test auf `SpielKarte` | Vertrauen in die Daten | S | gering |
| **P0** | Spielstatus | Laufendes Spiel = „Letztes Ergebnis“ (§2.2) | `istVergangen`/Übersicht über `spielPhase` (laufend ≠ vergangen); Übersicht zeigt „Läuft gerade“ | Richtigkeit am Spieltag | S | gering (Logik getestet) |
| **P0** | Spielstatus | Vergangene Spiele ohne Ergebnis verschwinden (§2.3) | Neue Phase „Ergebnis ausstehend“ und in Ergebnissen mit Hinweis zeigen; abgesagte Spiele mit Status zeigen | Keine „verschwundenen“ Spiele | S | gering |
| **P0** | Startseite | H1 läuft bei 360 px über | `hyphens-auto` (`lang="de"` ist gesetzt) oder kleinere Schrift unter `sm` | Kein seitliches Scrollen | S | sehr gering |
| **P1** | Navigation | Keine Bottom-Bar auf Mannschaftsseiten, Zurück immer zu `/mannschaften` | `VereinsNav` auch unter `[team]`; Zurück über Historie mit Fallback (`zurueck-button.tsx` existiert) | Keine Sackgasse in der PWA | S | gering |
| **P1** | Navigation | Kein Mannschaftswechsel | Team-Wechsler (Sheet) im Teamkopf | Eltern/Trainer mehrerer Teams | M | gering |
| **P1** | Home | Kein persönliches Zuhause | `/meine` als Dashboard (Jetzt / Als Nächstes / Neu / Teams) + Status/Live/„vorläufig“ ausgeschrieben | Täglicher Nutzen, Wiederkehr | M | mittel (API-Umbau) |
| **P1** | API | Favoriten-API N+1 | Eine Abfrage über alle Mannschafts-IDs (Gruppen → Tabellen/Spiele per `inArray`) | Ladezeit `/meine` | M | mittel; Test nötig |
| **P1** | Spiele-Liste | Geringe Dichte, Chip-Umbruch | Gruppierte Zeilen statt Einzelkarten; `flex-auto` entfernen bzw. Filter als Sheet | 2× mehr Spiele pro Bildschirm | M | mittel (viele Seiten nutzen `SpielKarte`) |
| **P1** | Barrierefreiheit | Tippflächen 16–40 px, 10-px-Texte | Mindestens 44 px für Links/Stern/Tabs/Chips/Schließen; min. 12 px; `motion-safe:animate-pulse`; S/U/N als Text | Bedienbarkeit, a11y | S–M | gering |
| **P1** | Zustände | Keine `loading.tsx`/`not-found.tsx` | Skeletons für Verein/Team/Meine; deutsche 404 mit Suche | Gefühlte Geschwindigkeit | S | gering |
| **P1** | Performance | Alles dynamisch, 10–12 Abfragen je Aufruf | Footer-`auth()` aus dem Root-Layout lösen (Client-Teil oder nur im Admin-Layout); öffentliche Daten cachen (Tag je Verein, invalidiert durch den Sync) | TTFB, DB-Last, Cold Starts | M–L | mittel; Next-16-Caching-Doku lesen, „Live“/Zwischenstand darf nicht einfrieren |
| **P1** | Kalender | Eltern übertragen Termine händisch | Öffentlicher ICS-Feed je Mannschaft + „Kalender abonnieren“ | Hoher Alltagsnutzen | M | gering (nur öffentliche Daten) |
| **P1** | Teilen | Kein Teilen | `navigator.share` für Spiel/Ergebnis/Mannschaft (Fallback: Link kopieren) | Wachstum über WhatsApp | S | sehr gering |
| **P1** | Startseite | Fan-Einstieg unter dem Fold | Suche oben, „Weiter zu Meine“ bei Favoriten | Erstkontakt | S | gering (Produktentscheidung) |
| **P1** | Offline | SW ohne Timeout und ohne Offline-Seite | Timeout (z. B. 4 s) → Cache; Offline-Seite; Datenstand anzeigen | Hallen mit schlechtem Netz | S–M | mittel (SW-Updates vorsichtig ausrollen) |
| **P2** | Design | Generische Karten, kleiner Spielstand | Anzeigetafel-Spielzeile, Gegner-Initialen, Statusfarben, ein Karten-Container je Tag | Eigenständige Identität | M | mittel |
| **P2** | Tabelle | Keine Tordifferenz/Form mobil | `+/-` mobil, Tore beim Antippen, Tabellenausschnitt auf Übersicht | Schnellere Einordnung | S | gering |
| **P2** | Folgen | Stern ohne Feedback, Onboarding fehlt | „Folgen“-Button mit Text, Toast, einmaliger Mannschafts-Hinweis | Mehr Favoriten → mehr Wiederkehr | S–M | gering |
| **P2** | Hydration | Filter springt nach dem Laden | Favoriten-Cookie (`hp_fav`, existiert) serverseitig für Default nutzen oder Chip-Zeile reservieren | Kein Inhaltssprung | S | gering |
| **P2** | Suche | Nur Teilstring, alle Vereine im Client | Normalisierung (Umlaute, Kürzel), Suche auch nach Ort/Mannschaft; später serverseitig mit Limit | Findbarkeit | S/M | gering |
| **P2** | PWA | Manifest `scope: "/"`, keine Shortcuts | Scope je Verein `/verein/<slug>/`, Shortcuts (Spiele/Teams/Meine); Icon-Route mit `s-maxage` | Sauberere Installation, weniger Funktionslast | S | mittel (Scope-Wechsel wirkt erst bei Neuinstallation) |
| **P2** | Inhalte | `StandHinweis` fest „Hessischer Handball-Verband“ | Quellen aus den tatsächlich genutzten Gruppen ableiten | Mehrverbandsfähigkeit | S | gering |
| **P2** | Feature | Spiel-Detailseite | `/verein/[slug]/spiel/[id]` mit Halbzeit, Duellen, Links, Teilen, JSON-LD | Ziel für geteilte Links, SEO | M | gering |
| **P2** | Feature | Wochenende-Bild zum Teilen | `ImageResponse` mit allen Ergebnissen des Wochenendes | Vereine posten es, Reichweite | M | gering |
| **P2** | Tests | Keine UI-/E2E-Tests | Playwright-Smoke-Tests (Mobil-Viewports) für die 6 Nutzerreisen, gegen Seed-DB | Regressionssicherheit | M | gering |
| **P3** | Feature | Kein Push | Web Push (Anwurf/Endergebnis/Verlegung) nach Datenschutzprüfung | Bindung | L | hoch (Datenschutz, iOS-Einschränkungen) |
| **P3** | Daten | Keine Liga-Spieltage | Sync aller Gruppenspiele (Verbandsabstimmung, Abruflast) | Spieltag-Ansicht | L | hoch |
| **P3** | Daten | Live nur vermutet | Verifizierte Live-Quelle (nuScoreLive) nach Rechteklärung | Echte Live-Erlebnisse | L | hoch |
| **P3** | Architektur | `sources/normalisierung.ts` ungenutzt | Entscheidung: an `SpielAnsicht` anbinden oder entfernen | Weniger toter Code | S | gering |

---

## 9. Quick Wins (klein, hoher Nutzwert, real vorhanden)

1. **H1-Überlauf bei 360 px beheben:** `hyphens-auto` an der Hero-H1 (`app/page.tsx`). 1 Zeile.
2. **Bottom-Bar auch auf Mannschaftsseiten:** `vereins-nav.tsx` gibt unter `[team]` heute `null` zurück. Stattdessen „Teams“ aktiv zeigen und `pb-28` im Team-Layout ergänzen.
3. **Tippflächen:**
   - Schließen-Button im Install-Hinweis auf `size-11`.
   - Spielbericht- und Live-Ticker-Links mit `min-h-11 inline-flex items-center`.
   - Zurück-Link und „Vereine ansehen“ mit `min-h-11`.
   - Stern `size-11`.
4. **`motion-safe:animate-pulse`** am Live-Punkt, und „vorläufig“ ausgeschrieben statt „*“ auf `/meine`.
5. **Filter-Chips nicht strecken:** `flex-auto` in `gefilterte-liste.tsx:20` entfernen. Dann gibt es keine einsame „Kinder“-Zeile mehr, ggf. horizontal scrollbar.
6. **Karten-Link zur Halle:** `halle_name` als Link (`https://www.google.com/maps/search/?api=1&query=…`). Keine Daten, keine Schemaänderung.
7. **Teilen-Button** auf Spiel- und Mannschaftskarten mit `navigator.share` und Fallback „Link kopiert“.
8. **Deutsche 404** (`app/verein/[slug]/not-found.tsx` + global) mit Vereinssuche.
9. **Status auf `/meine`:** „Verlegt“/„Abgesagt“-Badge aus `spiel.status` (die API liefert `status` bereits in `spielKurz`, `api/liga/favoriten/route.ts:21-32`; nur die Anzeige fehlt) und Leertext bei leerer Antwort.
10. **Sieg/Niederlage auch auf Mannschafts-Ergebnisseiten:** `mitAusgang` in `[team]/ergebnisse/page.tsx` setzen. Konsistent mit der Vereinsseite.

---

## 10. Umsetzungsvorschläge auf Komponentenebene

| Komponente / Datei | Änderung | Hinweise |
|---|---|---|
| `lib/liga-spiel-status.ts` | Eine Funktion `spielPhase(spiel, jetzt)` wird die **einzige** Wahrheit: `geplant · heute · laeuft · ergebnis_folgt · ausstehend (vergangen ohne Ergebnis) · beendet · vorlaeufig · verlegt · abgesagt · nicht_angetreten` | `spielPhase` existiert schon; erweitern statt neu bauen. Tests in `liga-spiel-status.test.ts`. |
| `lib/liga-spiele-hilfen.ts` | `istVergangen`/`istAnstehend`/`sammleVereinsSpiele` auf `spielPhase` umstellen; laufende Spiele in eigene Liste `heute` | Bestehende Tests als Regression; neue Fälle für „gestern ohne Ergebnis“ und „läuft“ |
| `components/liga/liga-ui.tsx` → neu `spiel-zeile.tsx` | Kompakte, tippbare Spielzeile (Anzeigetafel), Varianten über `phase`; Aktionen (Bericht, Ticker, Teilen, Karte) als 44-px-Buttons | `SpielKarte` vorerst behalten und intern auf `SpielZeile` umleiten, damit nicht alle Seiten auf einmal umgestellt werden müssen |
| neu `components/liga/tages-gruppe.tsx` | Ein Container je Tag mit Zeilen und Trennlinien | Ersetzt `<h2>` + Einzelkarten in `GefilterteListe` |
| `components/liga/gefilterte-liste.tsx` | Filter als Sheet-Button; Default aus Cookie `hp_fav` (serverseitig lesbar) statt Sprung nach der Hydration; optional Filter in `?f=` | `useSyncExternalStore`-Server-Snapshot bleibt leer, aber Default kommt vom Server |
| `components/liga/vereins-nav.tsx` | Auf Mannschaftsseiten „Teams“ aktiv; optional Ziel „Meine“ | `[team]/layout.tsx` braucht `pb-28 md:pb-0` |
| `app/verein/[slug]/[team]/layout.tsx` | Kompakter Kopf, Vereinsname nur einmal, Zurück über `ZurueckButton` mit Fallback, Team-Wechsler | Neues Client-Sheet `team-wechsler.tsx`; Daten aus `holeMannschaften` (schon geladen) |
| `components/liga/favorit-stern.tsx` | Variante mit Text („Folgen“); 44 px; Toast nach erstem Folgen | Kein neues Paket: kleines eigenes Toast mit `aria-live="polite"` |
| `components/liga/meine-mannschaften.tsx` + `api/liga/favoriten/route.ts` | Dashboard-Abschnitte; API: eine Abfrage für alle IDs (`liga_teilnahme`→`liga_gruppe`→`liga_tabellenzeile`/`liga_spiel` mit `inArray`); Rückgabe inkl. `phase` | Test für die Route (Mock `@/db/admin`), Cache-Header unverändert |
| neu `app/verein/[slug]/[team]/kalender.ics/route.ts` | Öffentlicher ICS-Feed der Mannschaft (nur Spiele, keine Personen) | Muster `app/kalender/[token]/route.ts`; `Cache-Control: public, s-maxage=3600` |
| neu `components/liga/teilen-button.tsx` | `navigator.share` + Kopier-Fallback | Kein Tracking-Parameter |
| `components/liga/installieren.tsx` | Schließen-Button 44 px | – |
| `components/liga/sponsor-splash.tsx` | `aria-modal`, Fokus auf „Weiter“, Fokus zurück | – |
| `components/footer.tsx` / `app/layout.tsx` | `auth()` nicht im Root-Layout; Footer-Link per Client-Komponente oder nur in Nicht-Fan-Layouts | Voraussetzung für jedes Caching der Fan-Seiten |
| `lib/liga-oeffentlich.ts` | Cache je Verein (Tag `liga-verein:<id>`), invalidiert im Sync; Status-Abfrage nicht doppelt; `holeVereinsDesign` ohne zweiten `liga_verein`-Read | **Wichtig:** `new Date()` in `SpielKarte` → Phase im Render berechnen, nicht cachen; oder Seiten-Cache nur kurz (z. B. 60 s). Erst `node_modules/next/dist/docs/` zu Caching lesen (`AGENTS.md`). |
| `public/sw.js` | Netz-Timeout, Offline-Fallback, Versionsnummer aus Build | `skipWaiting` ist gesetzt, also Update vorsichtig testen |
| `lib/liga-pwa.ts` | `scope` je Verein, `shortcuts` | Bestehende Installationen behalten ihren alten Scope bis zur Neuinstallation |
| `app/globals.css` / Tokens | Statusfarben als Tokens (`--status-live`, `--status-sieg` …) in Hell und Dunkel | Keine festen Hellfarben (siehe `CLAUDE.md`, Dark Mode) |
| Tests | Vitest für Phase/Listen/API; Playwright-Smoke (360/390 px) für Reisen 4.1–4.6 inkl. „kein horizontaler Überlauf“ und „Tippflächen ≥ 44 px“ | Seed analog `scripts/produkttour/seed.ts` |

**Entscheidung zu §2.1 (Zwischenstand), Empfehlung:** Den **Code an die Hilfe anpassen**, also keine Zahl während des Spiels, sondern „Läuft gerade“ plus Live-Ticker-Link, danach „Ergebnis folgt“.

Begründung: Bei stündlichem Sync ist die Zahl bis zu 60 Minuten alt und wird als Endstand missverstanden. Der Live-Ticker liefert den echten Stand.

Alternative: Die Zahl bleibt, aber mit Zeitstempel („Stand 19:40“) und die Hilfe wird angepasst.

---

## 11. Klare Empfehlung: die drei ersten Maßnahmen

1. **Spielstatus korrekt und an einem Ort machen (P0, ~2 Tage)**
   - `spielPhase` als einzige Quelle.
   - Laufende Spiele nie als „Ergebnis“.
   - Vergangene Spiele ohne Ergebnis sichtbar („Ergebnis ausstehend“).
   - Die Zwischenstand-Entscheidung treffen und Hilfe/Code angleichen.
   - Bereich **„Heute“** oben auf der Vereinsseite.

   *Warum zuerst:* Falsche oder verschwundene Spiele zerstören Vertrauen, und genau am Spieltag schauen die meisten Nutzer. Die Logik ist rein und gut testbar, also geringes Risiko.

2. **Navigation ohne Sackgassen (P1, ~2–3 Tage)**
   - Bottom-Bar auch auf Mannschaftsseiten.
   - Zurück über die Historie.
   - Team-Wechsler.
   - Tippflächen ≥ 44 px.
   - Kompakter Teamkopf.
   - H1-Überlauf beheben.

   *Warum:* Besonders in der installierten PWA (ohne Browser-Zurück) ist das heute der größte Reibungspunkt. Kleine Änderungen an wenigen Dateien.

3. **„Meine“ als persönliches Zuhause, mit Kalender-Abo und Teilen (P1, ~1 Woche)**
   - Dashboard: Jetzt / Als Nächstes / Neu seit letztem Besuch / Meine Teams.
   - Favoriten-API ohne N+1.
   - ICS-Feed je Mannschaft.
   - Teilen-Button.
   - Startseite mit Favoriten → „Weiter zu Meine“.

   *Warum:* Das macht aus „ich schaue mal beim Verein vorbei“ ein „ich öffne *meine* App“. ICS und Teilen bringen Bindung und Wachstum ohne Konto, ohne Push und ohne neue Personendaten, passend zum Datenschutz-Profil von HandballerPate.

Danach: Performance und Caching (Footer-`auth()`), dann Designüberarbeitung der Spielzeile (P2).
