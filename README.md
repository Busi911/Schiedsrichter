# FunktionsträgerHub

Verwaltungsplattform für Handball-Vereine: Funktionsträger (Schiedsrichter,
Zeitnehmer, Sekretäre, Trainer, Ordner, Kioskdienst), Terminverwaltung inkl.
ICS-Feed-Sync für Schiedsrichter, und perspektivisch Spielzuordnung,
Selbst-Anmeldung und eine einfache Zuschussberechnung. Details und Roadmap
siehe Planungsdokument im `.claude/plans`-Verzeichnis der Konversation, in der
dieses Projekt aufgesetzt wurde.

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

## Täglicher ICS-Sync (Vercel Cron)

`vercel.json` registriert `GET /api/cron/ics-sync`, einmal täglich ausgeführt
von Vercel Cron. Die Route ist per `CRON_SECRET` geschützt (Vercel sendet den
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
eine E-Mail an:

- den zugeordneten Schiedsrichter (bei ICS-Feed-Terminen), und
- alle Trainer der betroffenen Mannschaft (falls eine Mannschaft hinterlegt
  ist).

Bereits verschickte Erinnerungen werden in `benachrichtigung` protokolliert
und beim nächsten Lauf übersprungen (kein Doppel-Versand). Schlägt der
Mailversand fehl (z.B. SMTP nicht erreichbar), wird **keine**
Benachrichtigung protokolliert, sodass der nächste Cron-Lauf automatisch
erneut versucht. Lokal manuell auslösen:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/terminerinnerungen
```

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
  externen Abrechnungssystem.

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

*Bewusst nicht Teil dieses Imports:* eine Selbstverwaltung, mit der
Funktionsträger ihre eigenen Stammdaten später selbst aktualisieren können —
das ist als Backlog-Punkt vorgemerkt, nicht umgesetzt.

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

## Bekannte offene Punkte

- `drizzle-kit` zieht transitiv eine veraltete `esbuild`-Version (moderate,
  nur Dev-Dependency, betrifft nur den lokalen `drizzle-kit`-Dev-Server).
- `exceljs` zieht transitiv eine `uuid`-Version mit einer moderate-severity-
  Lücke (Buffer-Bounds-Check bei explizit übergebenem Buffer — wird von uns
  nicht in dieser Form aufgerufen).
- Testspiele/Turniere ohne hinterlegte Mannschaft und ohne Zuordnung
  bekommen aktuell keine Erinnerung, da niemand konkret zugeordnet ist.
- Selbstverwaltung für Funktionsträger-Stammdaten (Update durch die Person
  selbst) ist als Backlog-Punkt vorgemerkt, nicht umgesetzt.
