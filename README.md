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
- **`/admin/zuschuesse`** (`src/lib/zuschuss.ts`): listet vergangene
  Einsätze (Schiedsrichter/Zeitnehmer/Sekretär, aus `termin_zuordnung` und
  `ics_schiedsrichter_id` zusammengeführt) ohne bestehenden Zuschuss. Admin
  trägt einen Satz (€) ein → legt einen `zuschuss`-Datensatz an (Satz × 1
  Einsatz = Betrag). "Offene als CSV exportieren" liefert eine CSV aller
  offenen Zuschüsse und markiert sie im selben Request als `exportiert` —
  bewusst kein eigenes Rechnungs-/Zahlungsmodul, das läuft im externen
  Abrechnungssystem.

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

## Bekannte offene Punkte

- `drizzle-kit` zieht transitiv eine veraltete `esbuild`-Version (moderate,
  nur Dev-Dependency, betrifft nur den lokalen `drizzle-kit`-Dev-Server).
- Termin-Bearbeiten/-Löschen gibt es noch nicht (nur Anlegen).
- Testspiele/Turniere ohne hinterlegte Mannschaft und ohne Zuordnung
  bekommen aktuell keine Erinnerung, da niemand konkret zugeordnet ist.
- Zuschuss-Sätze werden manuell pro Einsatz eingegeben; feste Sätze pro
  Rolle/Verband oder Fahrtkosten-Berechnung sind (wie im ursprünglichen Plan
  vorgesehen) bewusst nicht Teil des MVP.
