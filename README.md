# HandballerPate

Verwaltungsplattform für Handball-Vereine: Funktionsträger (Schiedsrichter,
Zeitnehmer, Sekretäre, Trainer, Ordner, Kioskdienst), Terminverwaltung inkl.
ICS-Feed-Sync für Schiedsrichter, und perspektivisch Spielzuordnung,
Selbst-Anmeldung und eine einfache Zuschussberechnung. Geplante Erweiterungen
siehe Abschnitt "Roadmap" weiter unten; das ursprüngliche Planungsdokument
lag im `.claude/plans`-Verzeichnis der Konversation, in der dieses Projekt
aufgesetzt wurde.

Tech-Stack: Next.js 16 (App Router) auf Vercel, Neon.tech (Postgres) mit
Drizzle ORM, Auth.js (Magic-Link-Login), SMTP-Mailversand (Nodemailer).

## Lokales Setup

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. `.env.example` nach `.env` kopieren und Werte eintragen:
   - `DATABASE_ADMIN_URL`: der Connection String, den Neon initial ausgibt
     (privilegierte Owner-Rolle, z.B. `neondb_owner`).
   - `DATABASE_URL`: vorerst identisch mit `DATABASE_ADMIN_URL` lassen — wird
     in Schritt 3 durch die eingeschränkte `app_user`-Rolle ersetzt.
   - `AUTH_SECRET`: z.B. mit `openssl rand -base64 32` erzeugen.
   - `SMTP_*`: Zugangsdaten eines SMTP-Kontos für Magic-Link-Login und
     Terminerinnerungen.
   - `CRON_SECRET`: z.B. mit `openssl rand -base64 32` erzeugen (schützt den
     täglichen ICS-Sync-Cron-Endpoint).

3. Datenbankschema + Rollentrennung anwenden:

   ```bash
   npx drizzle-kit migrate
   ```

   Das legt u.a. die Rolle `app_user` an (siehe
   [Mandantentrennung](#mandantentrennung-multi-tenancy) unten). Danach
   einmalig ein Passwort für sie vergeben und `DATABASE_URL` darauf umstellen:

   ```sql
   ALTER ROLE app_user WITH PASSWORD 'ein-sicheres-passwort';
   ```

   ```bash
   # DATABASE_URL in .env: gleicher Connection String wie DATABASE_ADMIN_URL,
   # aber mit user=app_user und dem oben vergebenen Passwort.
   ```

4. Dev-Server starten:

   ```bash
   npm run dev
   ```

   Öffne [http://localhost:3000](http://localhost:3000).

## Mandantentrennung (Multi-Tenancy)

Alle Vereine teilen sich dieselbe Datenbank. Isolation erfolgt über
Postgres Row-Level-Security (`src/db/migrations/0001_enable_rls_multi_tenant.sql`):
jede mandantenbezogene Query muss innerhalb einer Transaktion laufen, die
zuvor `app.current_verein_id` gesetzt hat — siehe `withTenant()` in
`src/db/index.ts`. Domain-Code sollte **immer** `withTenant(vereinId, tx => ...)`
verwenden statt der rohen `db`-Instanz, sobald ein Verein-Kontext bekannt ist.

**Zwei DB-Rollen, das ist wichtig:** Neons Standard-Owner-Rolle (z.B.
`neondb_owner`) hat das Attribut `BYPASSRLS` — sie ignoriert RLS-Policies
komplett, unabhängig von `FORCE ROW LEVEL SECURITY`. Migration `0002` legt
deshalb eine zweite, unprivilegierte Rolle `app_user` an (kein BYPASSRLS),
die der reguläre App-Traffic verwendet (`DATABASE_URL`). Die privilegierte
Owner-Rolle (`DATABASE_ADMIN_URL`, `src/db/admin.ts`) ist ausschließlich für
Migrationen und den Cron-Job reserviert, der bewusst vereinsübergreifend
lesen muss. **`DATABASE_URL` darf niemals auf die privilegierte Rolle
zeigen** — sonst ist die Mandantentrennung wirkungslos, obwohl die Policies
existieren (das war der ursprüngliche Bug in diesem Projekt).

Die `user`-Tabelle (Auth.js-Identitäten) ist bewusst **ohne** RLS, da Auth.js
beim Login einen Nutzer per E-Mail finden muss, bevor der Verein-Kontext
überhaupt bekannt ist. Jede Admin-Query gegen `user` muss deshalb explizit
nach `verein_id` filtern — siehe Kommentar in der Migration.

Neuen Verein anlegen (Onboarding): Da `verein` selbst RLS-geschützt ist
(`id = current_verein_id`), muss die UUID vorab generiert und der
Tenant-Kontext vor dem Insert auf genau diese UUID gesetzt werden, z.B.:

```ts
const id = crypto.randomUUID();
await withTenant(id, (tx) => tx.insert(vereine).values({ id, name }));
```

## ICS-Sync (Vercel Cron)

`vercel.json` registriert `GET /api/cron/ics-sync`, einmal täglich
ausgeführt von Vercel Cron. Ein häufigerer Schedule (z.B. alle 6 Stunden)
wurde versucht, aber der Vercel-Hobby-Plan **lehnt das Deployment komplett
ab**, sobald ein Cron öfter als 1x/Tag laufen würde ("Hobby accounts are
limited to daily cron jobs") — kein stilles Herunterregeln, sondern ein
harter Deploy-Fehler. Ohne Upgrade auf den Pro-Plan bleibt es daher bei
einmal täglich. (Eine zwischenzeitliche Vermutung, der Hobby-Plan begrenze
zusätzlich die *Anzahl* an Cron Jobs pro Projekt, war ein Irrweg — der
eigentliche Grund für weitere fehlgeschlagene Deployments war ein fehlendes
`DATABASE_URL` in der Vercel-Projektkonfiguration, siehe
[Lokales Setup](#lokales-setup) für die vollständige Liste nötiger
Env-Variablen.) Die Route ist per `CRON_SECRET` geschützt (Vercel sendet den
Header `Authorization: Bearer $CRON_SECRET` automatisch mit, wenn die
Env-Variable gesetzt ist). Lokal manuell auslösen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ics-sync
```

Die Route nutzt `adminDb` (privilegierte, RLS-freie Verbindung) **nur**, um
vereinsübergreifend alle Schiedsrichter mit hinterlegter ICS-Feed-URL
aufzulisten. Der eigentliche Sync pro Schiedsrichter läuft danach über
`syncSchiedsrichterIcsFeed()`, das intern `withTenant()` verwendet — die
Schreibzugriffe bleiben also RLS-konform pro Verein.

`syncSchiedsrichterIcsFeed()` normalisiert `webcal://`/`webcals://`-URLs zu
`https://`, bevor der Feed abgerufen wird — viele Verbands-Kalendersysteme
(getestet mit nuLiga, u.a. beim Hessischen Handballverband im Einsatz) geben
ihre Abo-Links standardmäßig in diesem Schema aus, das `fetch()` sonst nicht
versteht. Erfolgreich end-to-end mit einem echten Schiedsrichter-Kalender der
Saison 2025/26 getestet (Import + wiederholter Sync ohne Duplikate).

## Terminauswertung & CSV-Export

`/admin/auswertung` zeigt alle Termine des Vereins, filterbar nach Zeitraum,
Typ und Schiedsrichter (`src/lib/termin-auswertung.ts`). Zwei Export-Formate,
beide mit denselben Filtern als Query-Parametern:

- **CSV** (`/admin/auswertung/export`, UTF-8 mit BOM, Excel-kompatibel) —
  Datengrundlage für die spätere Zuschussberechnung (Phase 3).
- **PDF** (`/admin/auswertung/export/pdf`, `src/lib/termin-pdf.ts`, via
  `pdfkit`) — druckbare Tabellenansicht, z.B. zum Aushängen/Weitergeben.

`pdfkit` lädt seine Font-Metrik-Dateien zur Laufzeit vom Dateisystem und
verträgt sich deshalb nicht mit dem Server-Bundling — daher steht es in
`serverExternalPackages` in `next.config.ts`.

## Terminerinnerungen (Vercel Cron)

`vercel.json` registriert zusätzlich `GET /api/cron/terminerinnerungen`,
täglich eine Stunde nach dem ICS-Sync. Sucht Termine, die innerhalb der
nächsten 36 Stunden starten (`src/lib/terminerinnerungen.ts`), und schickt
eine E-Mail (plus Push, siehe unten) an:

- den zugeordneten Schiedsrichter (bei ICS-Feed-Terminen),
- alle Trainer der betroffenen Mannschaft (falls eine Mannschaft hinterlegt
  ist), und
- alle über `/admin/zuordnung` oder Selbst-Anmeldung einem Termin
  zugeordneten Personen (Zeitnehmer, Sekretäre, Ordner, Kioskdienst, weitere
  Schiedsrichter) — schließt die Lücke bei Testspielen/Turnieren ohne
  Mannschaft, bei denen sonst niemand erreicht würde.

Bereits verschickte Erinnerungen werden in `benachrichtigung` protokolliert
und beim nächsten Lauf übersprungen (kein Doppel-Versand). Schlägt der
Mailversand fehl (z.B. SMTP nicht erreichbar), wird **keine**
Benachrichtigung protokolliert, sodass der nächste Cron-Lauf automatisch
erneut versucht. Push ist dabei ein zusätzlicher, unabhängiger Kanal — ein
fehlgeschlagener Push-Versand markiert die (bereits erfolgreiche) E-Mail
nicht als fehlgeschlagen. Lokal manuell auslösen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/terminerinnerungen
```

Derselbe Cron-Lauf verschickt außerdem eine Erinnerung an alle Admins eines
Vereins, wenn in den nächsten 3 Tagen noch Ordner-/Kioskdienst- oder
Zeitnehmer-/Sekretär-Bedarf offen ist (`src/lib/dienste-erinnerung.ts`,
Digest über alle betroffenen Termine statt einer Mail pro Termin) — ergänzt
die rein passive Anzeige auf `/admin/dienste` um eine aktive Erinnerung.
Bewusst kein Dedup wie oben: eine offene Lücke soll täglich in Erinnerung
bleiben, solange sie besteht (maximal 3 Mails pro Termin, da nur innerhalb
des 3-Tage-Fensters versendet wird).

## Wochen-Digest (Vercel Cron)

`vercel.json` registriert `GET /api/cron/wochen-digest`, wöchentlich
montags. Schickt jeder Person mit mindestens einem Einsatz in den nächsten 7
Tagen eine Übersichts-Mail (`src/lib/wochen-digest.ts`, nutzt dieselbe
Kalender-Logik wie `/profil`) — wer nichts eingetragen hat, bekommt keine
Mail. Lokal manuell auslösen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/wochen-digest
```

## PWA / Installierbarkeit

`public/manifest.json` + `public/sw.js` machen die App auf Mobilgeräten als
"App" installierbar (Add to Home Screen). Das Icon (`src/app/icon.svg`) kommt
über die Next.js Metadata-File-Convention automatisch als Favicon zum
Einsatz; `public/icon-192.png`/`icon-512.png`/`apple-touch-icon.png` sind
daraus gerasterte Fallbacks für das Manifest bzw. iOS-Homescreen-Icons, wo
SVG nicht zuverlässig unterstützt wird. Der Service Worker registriert sich
global (`src/components/sw-register.tsx`, Root Layout) — bewusst ohne
Offline-Caching/Fetch-Handler, da die App durchgehend serverseitig (Server
Actions, RLS-Session) rendert.

## Spielzuordnung, Selbst-Anmeldung, Zuschüsse (Phase 3)

- **`/admin/zuordnung`** (`src/lib/zuordnung.ts`): Admin ordnet Zeitnehmer,
  Sekretäre (oder weitere Schiedsrichter, z.B. für Testspiele/Turniere)
  konkreten anstehenden Terminen zu (`termin_zuordnung`, `quelle =
  zugeordnet_durch_admin`). Schiedsrichter aus dem ICS-Feed werden weiterhin
  automatisch über `termin.ics_schiedsrichter_id` abgebildet, nicht über
  `termin_zuordnung`.
- **Selbst-Anmeldung** (`/profil`, `src/app/profil/actions.ts`): Nutzer mit
  Rolle `ordner` oder `kioskdienst` sehen anstehende Termine des Vereins und
  können sich selbst ein-/austragen (`quelle = selbst_angemeldet`). Erscheint
  bei `/admin/zuordnung` entsprechend gekennzeichnet.
- **Öffentliche, login-freie Selbsteintragung** gibt es zusätzlich für zwei
  Rollen-Paare, je über einen Token-Link (Kenntnis des Tokens ist die
  Berechtigung, analog zu `/turnier/[token]`), vom jeweiligen Wart auf seiner
  Profilseite aktivierbar/deaktivierbar:
  - **Zeitnehmer/Sekretär**: `/zeitnehmer-eintragen/[token]`
    (`vereine.zeitnehmer_selbstanmeldung_token`, aktivierbar auf
    `/profil/zeitnehmerwart`).
  - **Ordner/Kioskdienst**: `/ordner-eintragen/[token]`
    (`vereine.ordner_selbstanmeldung_token`, aktivierbar auf
    `/profil/ordnerwart`).

  Beide teilen sich dieselbe Mehrfachauswahl-UI (`TerminMehrfachAuswahl` in
  `src/components/mehrfachauswahl.tsx`, rollenneutral über Props) und
  denselben Namensabgleich (`findeNamensVorschlag` in
  `src/lib/namens-abgleich.ts`): ein exakter Namenstreffer trägt die
  gefundene Person direkt ein, sonst landet die Zuordnung mit `externerName`
  und optionalem `matchVorschlagUserId`-Vorschlag beim jeweiligen Wart zur
  Bestätigung. `quelle = selbst_eingetragen_oeffentlich` ist für beide
  Rollen-Paare identisch — Auswertungen, die danach filtern, müssen
  zusätzlich nach `funktionstraeger_typ` unterscheiden (siehe
  `unbestaetigteSelbsteintragungen` in den jeweiligen Wart-Seiten).
- **`/admin/zuschuesse`** (`src/lib/zuschuss.ts`): Zuschüsse sind ein
  **Opt-in** pro Verein (`verein.zuschuesse_aktiviert`, Schalter oben auf der
  Seite) und gelten bewusst **nur für Schiedsrichter** (nicht
  Zeitnehmer/Sekretär). Der Admin pflegt zuerst einen Katalog an
  **Zuschussarten** (`zuschussart`: Bezeichnung + Satz, z.B.
  "Aufwandsentschädigung Schiedsrichter" / 20 €). "Offene Einsätze" listet
  vergangene Schiedsrichter-Einsätze (aus `termin_zuordnung` und
  `ics_schiedsrichter_id` zusammengeführt) ohne bestehenden Zuschuss; der
  Admin wählt dort eine Zuschussart aus (kein freier Betrag) → legt einen
  `zuschuss`-Datensatz an. "Offene als CSV exportieren" liefert eine CSV
  aller offenen Zuschüsse und markiert sie im selben Request als
  `exportiert` — bewusst kein eigenes Rechnungs-/Zahlungsmodul, das läuft im
  externen Abrechnungssystem. Schiedsrichter sehen den Status ihrer eigenen
  Zuschüsse (offen/exportiert) transparent auf `/profil`
  (`holeEigeneZuschuesse` in `src/lib/zuschuss.ts`), statt nur der
  Admin-Ansicht vertrauen zu müssen.

## Dienste-Bedarf (Ordner/Kioskdienst-Kapazität)

`/admin/einstellungen` legt pro Verein fest, wie viele Ordner und
Kioskdienst-Kräfte pro Testspiel bzw. Turnier benötigt werden (vier
unabhängige Werte, `verein.testspiel_ordner_bedarf` usw. —
`src/lib/dienste.ts`). Gilt **nicht** für `spiel_ics`-Termine: das sind die
persönlichen Einsätze des Schiedsrichters (oft bei fremden Vereinen), keine
Veranstaltungen des eigenen Vereins mit eigenem Personalbedarf.

Auf `/profil` sehen Nutzer mit Rolle `ordner`/`kioskdienst` die aktuelle
Kapazität ("2/3") und können sich anmelden, solange der Bedarf nicht erreicht
ist. Ist er erreicht, verschwindet der Anmelden-Button (serverseitig in
`selbstAnmelden()` zusätzlich abgesichert, falls zwei Personen gleichzeitig
den letzten Platz beanspruchen).

## Rundenspiele: manueller Import & automatischer nuLiga-Sync

Der Hallenspielplan-Tab auf `/admin/termine` importiert Pflichtspiele aus dem
Liga-Spielplan —
enthält bewusst **alle** Spiele an der eigenen Halle (nicht nur die eigenen
Mannschaften), da die Halle für jedes dort stattfindende Spiel
Ordner-/Kioskdienst braucht. Zwei Wege dorthin, beide über dieselbe
Import-/Dedup-Logik (`importiereRundenspielEreignisse` in
`src/lib/rundenspiel-sync.ts`, Match über `termin.ics_uid` — ein erneuter
Import aktualisiert bestehende Spiele bei Terminverlegung statt sie zu
duplizieren):

- **Manueller JSON-Upload** (`parseRundenspielJson`,
  `src/lib/rundenspiel-import.ts`): JSON-Export pro Halle, z.B. aus einem
  bestehenden Scraping-Workflow.
- **Automatischer nuLiga-Sync** (`src/lib/nuliga-scraper.ts`): Auf
  `/admin/einstellungen` bis zu drei Hallen-IDs hinterlegen und aktivieren —
  dieselben Angaben, die zuvor manuell in einen externen Scraping-Workflow
  eingetragen wurden. Holt das nuLiga-Hallen-HTML direkt per `fetch()` (fest
  verdrahtet auf `hhv-handball.liga.nu`/HHV, siehe Kommentar in
  `nuliga-scraper.ts` — andere Landesverbände brauchen eine weitere
  Domain-Konstante) für ein rollierendes 10-Monats-Fenster ab dem
  aktuellen Monat, statt eines fest einzutragenden Start-/Endmonats, der mit
  der Zeit veralten würde. Läuft täglich per Vercel Cron
  (`/api/cron/rundenspiel-sync`) für alle Vereine mit aktiviertem
  Auto-Import; nach dem Speichern der Hallen-IDs läuft zusätzlich sofort ein
  erster Sync, statt auf den nächsten Cron-Termin zu warten.

Die Beschreibung importierter Rundenspiele kennzeichnet zusätzlich
Freundschaftsspiel/Turnier vs. echtes Ligaspiel (anhand der vom Verband
vergebenen Spielnummer, `gameNumber` — siehe `bildeUid` in
`rundenspiel-import.ts`) sowie ggf. weitere Zellen nach Heim-/Auswärtsteam
im nuLiga-Export (z.B. ein Schiedsrichter-Kürzel, Format je Halle/Verband
unbestätigt, daher roh statt interpretiert angehängt).

**Duplikat-Erkennung** (`src/lib/duplikat-erkennung.ts`): Admins legen
Testspiele oft manuell an, bevor ein Spiel offiziell im Verbandssystem
geführt wird (z.B. weil noch kein Schiedsrichter feststeht). Erscheint
dieselbe Begegnung später über den nuLiga-Sync als Rundenspiel, existieren
beide Termine parallel und doppeln sich im Kalender. Der Hallenspielplan-Tab
auf `/admin/termine` zeigt solche Fälle (gleicher Kalendertag + Team-Name-Match oder zeitliche
Nähe) als Vorschlagsliste zum manuellen Aufräumen — bewusst kein
automatisches Löschen, da beide Signale nicht zuverlässig genug für eine
automatische Entscheidung sind.

## Systemadmin (vereinsübergreifend)

Nutzer mit `user.ist_system_admin = true` haben **kein** `verein_id` (gehören
keinem einzelnen Verein an) und verwalten stattdessen unter
`/system/vereine` (`src/app/system/`) alle Vereine im System — Liste
(via `adminDb`, bewusst privilegiert/vereinsübergreifend) und ein Formular,
das analog zu `/setup` einen neuen Verein + dessen ersten Admin anlegt
(`withTenant`-Insert, RLS-konform). Das ersetzt den `SETUP_SECRET`-Bootstrap
für den Regelbetrieb — `/setup` bleibt als Notfall-Fallback bestehen, falls
kein Systemadmin mehr erreichbar ist.

`requireSystemAdmin()` (`src/lib/session.ts`) prüft nur die Session, nicht
`vereinId` (im Gegensatz zu `requireSession()`/`requireAdmin()`), da
Systemadmins bewusst keinem Verein zugeordnet sind. Auf der Startseite
(`src/app/page.tsx`) werden sie vor der normalen Admin-Weiterleitung zuerst
auf `/system/vereine` geleitet.

## Excel-Import für Funktionsträger

`/admin/funktionstraeger` → "Aus Excel importieren": Kopfzeile mit den
Spalten Name, E-Mail, Rolle (deutsche Bezeichnung oder Rollen-Key) und
optional Mannschaft (nur bei Trainer, muss namentlich zu einer bestehenden
Mannschaft passen). Parsing über `exceljs`
(`src/lib/funktionstraeger-import.ts`) — **bewusst nicht** das populäre
`xlsx`/SheetJS-Paket, dessen npm-Version ungepatchte Prototype-Pollution-
und ReDoS-Lücken hat (kritisch bei nutzergeladenen Dateien). Bereits
vorhandene Personen/Rollen werden beim Import übersprungen statt dupliziert;
das Ergebnis (angelegt/übersprungen/Fehler pro Zeile) wird nach dem Import
als Banner auf der Seite angezeigt.

Für die eigenen Stammdaten (Name, Telefonnummer) danach gibt es keinen
erneuten Import-Bedarf: Funktionsträger pflegen das selbst auf `/profil`
(`updateStammdaten` in `src/app/profil/actions.ts`) — bewusst ohne
E-Mail-Änderung, die bleibt login-kritisch Admin-Aufgabe
(`updateFunktionstraeger`).

## Termine bearbeiten/löschen

`/admin/termine/[id]` erlaubt das Bearbeiten und Löschen manuell angelegter
Termine (Testspiele/Turniere). Termine aus dem ICS-Feed (`quelle: "ics_feed"`)
sind davon bewusst ausgeschlossen — sie werden vom Sync verwaltet und würden
bei manueller Änderung beim nächsten Lauf wieder überschrieben.

## Willkommens-Mail & Aktivierung

Beim Anlegen eines Funktionsträgers (einzeln oder per Excel-Import) kann per
Schalter gewählt werden, ob sofort eine Willkommens-Mail mit Login-Hinweis
verschickt wird, oder ob die Person zunächst **ohne Login** angelegt wird.
Im zweiten Fall taucht sie inaktiv in der Liste auf; erst wenn ein Admin sie
über "Aktivieren" freischaltet, geht die Mail raus (`funktionstraegerAktivToggeln`
in `src/app/admin/actions.ts`). Das Aktiv-Flag lebt pro Rolle
(`funktionstraeger_rolle.aktiv`), nicht pro Person — inaktive Rollen tauchen
nicht mehr in Zuordnung oder Selbst-Anmeldung auf, bleiben aber in der
Zuordnungs-/Zuschuss-Historie erhalten (bewusst kein Löschen).

Wird jemand einem Termin als Schiedsrichter/Zeitnehmer/Sekretär zugeordnet
(`/admin/zuordnung`), geht ebenfalls automatisch eine Mail raus
(`src/app/admin/zuordnung/actions.ts`).

Bei der Einzelanlage können mehrere Rollen gleichzeitig per Checkbox-Gruppe
ausgewählt werden (`typen` statt `typ` im Formular) — ein Nutzer kann
beliebig viele Funktionsträger-Rollen gleichzeitig haben.

## Admin-Dashboard & Kalender

`/admin` zeigt eine Übersicht (nächste Termine, unbesetzte Ordner-/
Kioskdienst-Termine, offene Zuschuss-Einsätze) statt direkt auf Mannschaften
zu leiten. `/admin/kalender` zeigt einen Monatskalender mit allen
Vereinsterminen; `/profil/kalender` zeigt jedem Funktionsträger die Termine,
bei denen er/sie beteiligt ist (ICS-Zuordnung, Termin-Zuordnung oder eigene
Mannschaft als Trainer). Die Kalender-Logik (Monatsraster, Wochenstart
Montag) ist bewusst dependency-frei in `src/lib/kalender.ts` implementiert.

## Tests

`npm test` führt Vitest über die reine Business-Logik aus (Dienste-Bedarf,
Kalender-Berechnung, CSV-Formatierer, Excel-Import-Parser) — kein Browser,
keine Testdatenbank nötig. Da `"server-only"` kein echtes npm-Paket ist
(Next.js löst es intern auf), aliast `vitest.config.mts` es auf ein leeres
Stub-Modul (`test/server-only-stub.ts`).

### Mandantentrennung (RLS) gegenprüfen

`src/db/tenant-isolation.test.ts` ist die einzige Ausnahme, die eine echte
Postgres-Instanz braucht — er prüft direkt gegen die DB, dass Verein A
niemals Daten von Verein B sehen oder anlegen kann (siehe migrations/0001).
Ohne `TEST_DATABASE_URL`/`TEST_DATABASE_ADMIN_URL` wird er übersprungen,
`npm test` bleibt also auch ohne lokale DB grün. Zum Ausführen: eine
Postgres-Instanz mit allen Migrationen aus `src/db/migrations` (in
Journal-Reihenfolge) anlegen, dann analog zu Schritt 2/3 oben eine
Owner-Rolle (bypassrls) und `app_user` (ohne bypassrls, Passwort setzen)
einrichten und

```bash
TEST_DATABASE_ADMIN_URL="postgres://<owner>:<pw>@localhost:5432/<db>" \
TEST_DATABASE_URL="postgres://app_user:<pw>@localhost:5432/<db>" \
npx vitest run src/db/tenant-isolation.test.ts
```

Nach jeder Änderung an den RLS-Policies (migrations/0001, 0006, 0012, 0026,
0043) sollte dieser Test erneut laufen.

## Design (shadcn/ui)

Die Oberfläche nutzt [shadcn/ui](https://ui.shadcn.com) im "Nova"-Stil auf
Basis von [Base UI](https://base-ui.com) (nicht Radix — neuere
shadcn-Generation) und Tailwind v4, siehe `components.json` und
`src/components/ui/`. Wichtige Stolpersteine, falls weitere Komponenten
ergänzt werden:

- **Formulare bleiben native `<form action={serverAction}>`-Elemente ohne
  Client-JS-State.** `Select` funktioniert trotzdem mit reinen Server
  Actions, weil Base UI bei gesetztem `name`-Prop einen versteckten nativen
  `<input>` rendert. Wiederverwendbare Wrapper-Komponente:
  `src/components/labeled-select.tsx`.
- **Kein Function-as-Children von Server- an Client-Components.** `<Select>`
  bräuchte eigentlich eine Render-Funktion für das Label, aber Server
  Components dürfen keine Funktionen als Props/Children an Client
  Components weiterreichen (RSC-Serialisierungsgrenze). Deshalb kapselt
  `LabeledSelect` diese Funktion selbst als Client Component; Server
  Components übergeben ihr nur reine Daten (`{value, label}[]`).
- **`<Button render={<a href="..." />}>` braucht `nativeButton={false}`**,
  sonst wirft Base UI eine Konsolen-Warnung (Button erwartet standardmäßig
  ein natives `<button>`-Element hinter dem `render`-Prop).
- Ein serverseitig neu berechneter `defaultChecked`/`defaultValue` an einer
  unveränderten Komponentenposition (z.B. nach `revalidatePath()`) wird von
  React als "uncontrolled component ändert sich nach Initialisierung"
  gewarnt — beheben mit `key={...}`, um einen echten Remount zu erzwingen
  (siehe `Switch` in `src/app/admin/zuschuesse/page.tsx`).

## Roadmap

### Öffentlicher Bereich ("Vereine & Mannschaften", ohne Login)

**Idee:** Ein vom Vereins-Login getrennter, für alle offener Zugang. Jede
Person (auch ohne Konto) sieht eine Liste aller angebundenen Vereine, wählt
einen aus und sieht dessen Mannschaften mit aktueller **Tabelle**,
**Spielplan** und **Ergebnissen** — ähnlich wie in gängigen Handball-Apps
(Vereinsliste mit Favoriten-Stern und "+" zum Hinzufügen; pro Mannschaft die
Tabs Tabelle / Ergebnisse / Spielplan, optional Kader; Filter "Nur eigene
Spiele"). Der bisherige Bereich für Funktionsträger/Admins bleibt davon
unberührt; die Startseite verweist künftig auf beide Zugänge.

**Status:** Erste Version umgesetzt unter `/verein/[slug]` (Branch
`claude/oeffentliche-vereinsseiten`): nuLiga-Sync (`src/lib/nuliga/`),
Vereins- und Mannschaftsseiten (Übersicht/Spielplan/Ergebnisse/Tabelle),
Favoriten für eingeloggte Konten, Sitemap/robots. Abweichungen von den
Vorschlägen unten: Seite entsteht, sobald ein Admin in
`/admin/einstellungen` die nuLiga-Vereins-ID hinterlegt (kein Systemadmin-
Import beliebiger Vereine); Favoriten liegen in der DB (nicht localStorage);
URL `/verein/…` statt `/vereine/…`. Der Rest der Liste unten gilt weiter als
Vorschlag (z.B. handball.net ab der 3. Liga, Besucher-Konten).

**Offene Fragen vorab**

- **"Angebunden":** **Entschieden (01.10.2026):** Die Seite entsteht,
  sobald ein Admin in `/admin/einstellungen` die nuLiga-Vereins-ID hinterlegt
  — kein zusätzlicher Verein-Schalter, kein Systemadmin-Import.
- **Datenquelle Tabelle:** **Umgesetzt (Stand des Codes auf `main`, nach
  Durchsicht der Quellen — nicht selbst gegen die Live-Seiten getestet):**
  - **nuLiga (HHV):** Über die Vereins-ID (`clubTeams?club=<id>`, Parser
    `src/lib/nuliga/parsers/club-teams.ts`) werden alle Mannschaften eines
    Vereins gefunden; von dort aus werden Gruppenseite (Tabelle + Spielplan,
    `parsers/group-page.ts`) und Mannschaftsportrait
    (`parsers/team-portrait.ts`) gelesen. Sync in `src/lib/nuliga/sync.ts`
    (Struktur und Spiele getrennt, idempotent, fehlertolerant), Cron
    `/api/cron/liga-sync` über `sync-cron.ts` (spieltagsnah häufiger).
    Tabellen liegen als `liga_tabellenzeile` in der DB (gecacht, kein Abruf
    pro Seitenaufruf). nuLiga ist bisher nur für den HHV konfiguriert
    (`src/lib/nuliga/verbaende.ts`; weitere Verbände = weiterer Eintrag).
    Die Spalte "Mannschaftsverantwortlicher" wird bewusst nie gelesen
    (Datenschutz). Zurückgezogene Mannschaften werden erkannt und
    ausgeblendet (#178, #181).
  - **handball.net (ab der 3. Liga):** Zweite Quelle über die JSON-API
    (`src/lib/handball-net/`), Einstieg über die handball.net-Vereins-ID,
    optional manuell ergänzte Team-IDs; die Tabelle wird dort aus den Spielen
    berechnet (`berechneTabelle` in `modell.ts`). Unabhängig von nuLiga (ein
    Ausfall betrifft die andere Quelle nicht).
  - **Noch offen:** weitere Landesverbände (nuLiga-Domain je Verband); ob
    handball.net- und nuLiga-Daten für denselben Verein sauber
    zusammenlaufen (Dubletten); Verhalten bei geänderter HTML-Struktur
    (Parser meldet Warnungen, löscht bei unlesbarer Seite nichts — echte
    Seitenänderungen testweise abwarten).
- **Welche Spiele:** Für den öffentlichen Spielplan zählen die Spiele der
  *eigenen Mannschaften* (Mannschaft mit Liga-Anbindung), nicht die
  Hallenbelegung fremder Mannschaften, die für Ordner-/Kioskdienst importiert
  wird (`termin.typ = 'rundenspiel'`, siehe Abschnitt "Rundenspiele").
  Vorschlag: pro Mannschaft `handballNetTeamId` bzw. nuLiga-Zuordnung
  nutzen und die Tabelle ebenfalls dort abholen.
- **Kader/Torschützen:** Personenbezogen, daher zunächst **nicht** im Umfang
  (DSGVO, `/datenschutz` ist ein Entwurf). Erst nach juristischer Prüfung und
  nur mit Einwilligung bzw. opt-in.

**Technische Leitplanken**

- Neue login-freie Routen (z.B. `/vereine`, `/vereine/[slug]`,
  `/vereine/[slug]/[mannschaft]`) in `publicRoutes` bzw. als Präfix in
  `src/proxy.ts` freigeben; bestehendes Muster: `/turnier/`, `/kalender/`.
- Lesezugriff ohne Session läuft über `adminDb` mit **explizitem** Filter auf
  den freigeschalteten Verein (kein `withTenant` ohne Session) — Ausnahme
  analog zu den öffentlichen Token-Seiten. Nach dem Bau
  `src/db/tenant-isolation.test.ts` ergänzen bzw. laufen lassen und prüfen,
  dass keine nicht freigeschalteten Vereine und keine internen Daten
  (Zuordnungen, Personen, Schiedsrichter-Besetzung, E-Mails) ausgeliefert
  werden.
- Nur aufbereitete, öffentliche Felder ausliefern (Datum, Halle, Teams,
  Ergebnis, Tabelle). **Keine** Funktionsträger-Namen, auch wenn
  handball.net sie anzeigt.
- Tabelle cachen (z.B. beim täglichen Sync in der DB ablegen statt bei jedem
  Aufruf beim Verband abzufragen); Sync-Fehler dürfen die Seite nicht kaputt
  machen (letzten Stand mit Zeitstempel zeigen).
- Mobile first (~375–390px, siehe "Mobile-Optimierung" in `CLAUDE.md`); die
  Mannschafts-Ansicht nutzt die vorhandene Bottom-Navigation
  (`src/components/bottom-nav.tsx`) mit Tabs Tabelle / Ergebnisse /
  Spielplan. Favoriten ("Meine Vereine") zunächst lokal im Browser
  (`localStorage`, mit try/catch), kein Konto nötig.
- SEO/Teilen: sprechende URLs pro Verein/Mannschaft, Open-Graph-Metadaten.
- Rechtliches: `/datenschutz` enthält einen Abschnitt zu den öffentlichen
  Vereins- und Mannschaftsseiten sowie zu Zugriffsdaten (Server-Protokolle,
  IP-Adresse) auch ohne Konto (der frühere Entwurf-Warnhinweis auf `/datenschutz` und `/admin/avv`
  wurde auf Wunsch entfernt, die Texte sind aber nicht juristisch geprüft).
  **Offen:** juristische Prüfung der Texte; Impressum nennt
  DeWe Consulting UG als Betreiber — zu klären, ob für den öffentlichen
  Bereich (und die dort angezeigten Verbandsdaten) etwas ergänzt werden
  muss. Zu den Abrufen: Laut Kommentar im Code haben HHV (nuLiga) und DHB
  (handball.net) dem automatischen Abruf zugestimmt — die Zustimmung ggf.
  schriftlich ablegen; für weitere Verbände jeweils neu klären.

**Grober Ablauf**

1. Entscheidungen zu "angebunden", Datenquelle Tabelle und Umfang klären.
2. Machbarkeit Tabelle prüfen (nuLiga `clubTeams`-Seite mit Vereins-ID
   und handball.net), Datenmodell + Sync ergänzen.
3. Öffentliche Seiten (Vereinsliste, Mannschaft mit Tabelle/Ergebnisse/
   Spielplan), Schalter in den Einstellungen, Routen freigeben.
4. Tests (Isolation, Datenschutz), Datenschutzerklärung, Startseite verlinken.
5. Später: Kader/Torschützen, Favoriten mit Konto, Push bei Ergebnissen.

### Stand der Abstimmung (30.09.2026)

Sammelstelle für alles, was in den letzten Arbeitsschritten besprochen wurde,
noch offen ist oder bewusst *nicht* umgesetzt wurde. Beim Weiterarbeiten
hier abhaken bzw. entfernen.

**Umgesetzt und live (`main`)**

- `/admin/termine` mobil: Liste nach Tag gruppiert (Desktop-Tabelle
  unverändert).
- Produkttour-Screenshots: der Workflow "Produkttour-Screenshots neu
  erzeugen" (manuell startbar) committet geänderte Bilder selbst zurück in
  den Branch, auf dem er läuft; Kalender-Zuschnitt 1440×600, Text angepasst.
- Mail "Termin geändert" an eingetragene Personen mit Login, wenn bei einem
  **manuellen** Termin (Freundschaftsspiel/Turnier) Zeit oder Ort geändert
  wird. Zuordnungen bleiben bewusst bestehen (nur benachrichtigen, nicht
  austragen). Der echte Mailversand wurde noch nicht ausprobiert (s.u.).

**Gemergt und am Handy geprüft** (bestätigt am 01.10.2026)

- Eintragen-Leiste auf `/zeitnehmer-eintragen/…` und `/ordner-eintragen/…`
  klebt am unteren Rand; Umschalter "Nach Datum" (Standard) / "Offene
  zuerst".
- Bottom-Navigation (`src/components/bottom-nav.tsx`) mobil für Admin
  (Übersicht, Kalender, Termine, Training, Mehr), `/profil` (rollenabhängig;
  ohne Rollen Profil + Hilfe) und `/system`.
- Wart-Seiten (Zeitnehmer, Ordner): Selbsteintragungs-Link prominent mit
  Kopieren/Teilen/Öffnen; "Link neu generieren" und "Deaktivieren" unter
  "Weitere Optionen".

**Gemergt, noch nicht bestätigt**

- Öffentliche Tabelle: zurückgezogene Mannschaften werden ausgeblendet
  (`holeTabelle` filtert `zurueckgezogen`, #181). Prüfen, ob die Zeile in der
  Live-Tabelle verschwindet; falls nicht, einmal "Jetzt aktualisieren" in
  `/admin/einstellungen` (setzt das Merkmal beim Sync).
- Mail "Termin geändert" bei manuellen Terminen: Uhrzeit eines Testspiels mit
  eingetragenem Zeitnehmer ändern und prüfen, ob die Mail ankommt.

**Besprochen und entschieden**

- Bottom-Navigation: "Training" (statt Dienste) ist der vierte Admin-Tab,
  "Offene Dienste" liegt unter Mehr, der Zähler offener Dienste steht als
  Badge am Mehr-Tab. Alle eingeloggten Personen bekommen die Leiste, nicht
  nur Admins. Desktop-Navigation bleibt unverändert.
- Eintragen-Seiten (`/zeitnehmer-eintragen`, `/ordner-eintragen`): Standard
  der Sortierung ist "Offene zuerst" (Umschalter auf "Nach Datum" bleibt),
  entschieden am 01.10.2026.
- Bei manuell geänderten Terminen werden Eingetragene **nicht** ausgetragen
  (anders als beim automatischen Sync des Hallenspielplans).
- Beim Sync-Fall (Hallenspielplan, nuLiga/handball.net) bleibt es beim
  bisherigen Verhalten: Funktionsträger außer Schiedsrichtern werden bei
  Verlegung ausgetragen und per Mail informiert; Admin-Sammelmail nur mit
  Opt-in (`/admin/einstellungen`, Default aus).

**Noch zu entscheiden / bewusst nicht gebaut**

- Sammelmail an Admins bei Änderung manueller Termine — nicht gebaut, da
  zunächst nur die Eingetragenen informiert werden sollten.
- Mails bei geänderten ICS-Terminen (`spiel_ics`, persönlicher Feed eines
  Schiedsrichters) — nicht gebaut, weil niemand sonst darauf eingetragen
  ist; bei Bedarf neu entscheiden.
- Schiedsrichter bei Ligaspielen bleiben bei einer Sync-Verlegung
  eingetragen und bekommen **keine** Mail (der Verband setzt sie an);
  Trainer und Spieler werden bei Verlegungen generell nicht informiert.
  Soll sich das ändern?
- Bottom-Navigation: `/hilfe` liegt außerhalb der Layouts und zeigt keine
  Leiste (dort gibt es den Zurück-Button). Ggf. angleichen.
- Workflow "Produkttour-Screenshots": der Push-Schritt scheitert, sobald
  `main` per Branch-Schutz nur noch über Pull Requests änderbar ist — dann
  automatisch einen PR erzeugen lassen statt direkt zu pushen.

## Bekannte offene Punkte

- `drizzle-kit` zieht transitiv eine veraltete `esbuild`-Version (moderate,
  nur Dev-Dependency, betrifft nur den lokalen `drizzle-kit`-Dev-Server).
- `exceljs` zieht transitiv eine `uuid`-Version mit einer moderate-severity-
  Lücke (Buffer-Bounds-Check bei explizit übergebenem Buffer — wird von uns
  nicht in dieser Form aufgerufen).
- Testspiele/Turniere ganz ohne jede Zuordnung (weder Mannschaft noch
  `termin_zuordnung`) bekommen weiterhin keine Erinnerung, da niemand
  konkret ermittelbar ist.
- Der automatische nuLiga-Sync ist fest auf einen Landesverband (HHV)
  verdrahtet (siehe `src/lib/nuliga-scraper.ts`) — weitere Verbände
  bräuchten eine zusätzliche Domain-Konstante bzw. ein Verein-Einstellungsfeld
  dafür.
