@AGENTS.md

## E-Mail-Layout

Jede transaktionale Mail geht über `src/lib/email-layout.ts`
(`emailAlsText`/`emailAlsHtml`, Typ `EmailInhalt`) statt ein eigenes
HTML-Grundgerüst zu bauen — sonst driften Styling und Aufbau über die Zeit
auseinander (Inline-Styles + Tabellen-Layout, da die meisten Mail-Clients,
allen voran Outlook Desktop, `<style>`-Blöcke und Flexbox/Grid ignorieren).

Konvention für neue Mails: eine Funktion, die ein `EmailInhalt`-Objekt
zurückgibt (Inhalt EINMAL beschrieben, nicht in Text- und Html-Version
separat gepflegt), z.B.:

```ts
function xInhalt(...): EmailInhalt {
  return {
    vereinName, // weglassen bei Mails ohne Vereins-Kontext (z.B. Login-Link)
    ueberschrift: "...",
    zeilen: ["...", "..."],
    cta: { text: "...", url: "..." }, // optional
    kleingedrucktes: "...", // optional, unaufdringlicher Hinweis unten
  };
}
```

Beim Versenden dann `sendMail(to, subject, emailAlsText(inhalt), emailAlsHtml(inhalt))`.

`login-mail.ts` und `termin-mail.ts` sind ältere, noch bestehende
Text/Html-Funktionspaare, die intern auf `email-layout.ts` delegieren —
neue Mails brauchen kein eigenes Paar mehr, sondern nutzen das
`EmailInhalt`-Muster direkt.

## Sponsor je Verein (Sponsorenbild auf der öffentlichen Seite)

Ein Sponsor, der die technischen Kosten übernimmt, bekommt je Verein ein kurzes Bild beim Öffnen der
öffentlichen Seite ("Präsentiert von …", einmal pro Tag und Gerät, wegtippbar). Gepflegt NUR vom
Systemadmin unter `/system/sponsor` (Tabelle `verein_sponsor`: aktiv, Name, https-Link, Dauer 2–8 s,
gültig bis, Bild als kleines WebP (max. 640×480 px); nur `adminDb`, `app_user` hat keinen Zugriff). Wirksam nur, wenn
aktiv UND Bild vorhanden UND Zeitraum nicht abgelaufen (`sponsorWirksam`, `lib/sponsor.ts`). Bild über
`/verein/[slug]/sponsor` (404 solange nicht wirksam), Anzeige per `components/liga/sponsor-splash.tsx` im
Layout `verein/[slug]/layout.tsx`. Kein Tracking: "heute gezeigt" liegt nur in localStorage;
`?sponsor=zeigen` erzwingt die Anzeige (Vorschau). Kein SVG-Upload (XSS), Links nur https.
Datenschutzseite enthält dazu einen Abschnitt.

## Abbestellbare Mails (Abmelde-Link)

Die optionalen Erinnerungs-/Übersichtsmails (Wochenübersicht, Terminerinnerung, offene
Schiedsrichter-/Zeitnehmer-Dienste, Dienste-Broadcast) enthalten einen persönlichen, signierten
Abmelde-Link (`lib/abmelden.ts`: HMAC über `AUTH_SECRET`, gilt nur für Person + Mailart) und den
Header `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058, Ein-Klick über
`/api/abmelden/[token]`; Gmail/Outlook zeigen "Abbestellen"). Der sichtbare Link führt auf
`/abmelden/[token]` (öffentlich, ändert erst nach Klick/POST — Mail-Scanner rufen Links vorab ab) und
schaltet denselben persönlichen Schalter aus wie Profil → Benachrichtigungen. Neue abbestellbare Mail:
Art in `ABMELDE_ARTEN` + `FELD` ergänzen, `abmelden: abmeldeInfo(userId, art)` in den `EmailInhalt` und
`{ abmeldeUrl }` als 5. Argument an `sendMail`. Login-Link, Verlegungen, Admin-/System-Mails sind bewusst
NICHT abbestellbar.
Im Profil (Benachrichtigungen) gibt es dafür nur zwei Schalter plus EINEN gemeinsamen "Hinweise zu offenen Diensten" (`offeneDiensteHinweise`): er setzt in `updateBenachrichtigungen` die drei Einzel-Flags (Schiedsrichter-/Zeitnehmer-Erinnerung, Dienste-Broadcast), soweit sie für die Rollen der Person gelten; die Spalten bleiben getrennt (Abmelde-Link je Mailart).

## Formular-Buttons (Server Actions)

Jeder `<Button type="submit">` innerhalb eines `<form action={serverAction}>`
muss `SubmitButton` (`src/components/submit-button.tsx`) bzw. bei
bestätigungspflichtigen/destruktiven Aktionen `ConfirmSubmitButton`
(`src/components/confirm-submit-button.tsx`) statt der einfachen `Button`-
Komponente verwenden — sonst fehlt der Lade-Spinner (`useFormStatus`/
`pending`) während des Server-Roundtrips, und ein Klick wirkt bei
langsamerer Verbindung reaktionslos statt sichtbar in Bearbeitung. Beide
Komponenten übernehmen alle `Button`-Props (`variant`, `size`, `className`,
...) 1:1, ein Umstieg von `Button` ist also nie mehr als ein Umbenennen.

## Rechtliche Inhalte (Datenschutz/AVV)

`/datenschutz` und `/admin/avv` sind automatisiert erstellt und nicht
juristisch geprüft. Der frühere Entwurf-Warnhinweis auf den beiden Seiten
wurde auf ausdrücklichen Wunsch des Betreibers entfernt (01.10.2026) — beim
Weiterschreiben dieser Texte keinen neuen Warnhinweis einbauen, solange
nichts anderes gewünscht wird. Die juristische Prüfung bleibt als offener
Punkt in der Roadmap (README).

## Zwei-Ebenen-Benachrichtigungen (Verein-Default + Personen-Override)

Neue optionale Mail-Kanäle, die an eine ganze Personengruppe gehen (nicht
nur an Admins), bekommen zwei Schalter: ein Verein-weiter Ein/Aus-Schalter
(Admin, `/admin/einstellungen`, Default aus) UND ein persönlicher
Override pro Person (`/profil`-Benachrichtigungen, Default an, greift nur
wenn der Verein-Schalter an ist). Referenzimplementierung:
`vereine.offeneDiensteBroadcastAktiviert` +
`users.offeneDiensteBroadcastAktiviert` in `lib/dienste-broadcast.ts`.
Bestehende ältere Erinnerungs-Flags (`wochenDigestAktiviert` etc.) haben
dieses zweistufige Muster NICHT — nicht rückwirkend umbauen, ohne
explizit danach gefragt zu werden.

## Datenbank: Cold-Start-Schutz

Neon fährt nach Inaktivität herunter; der erste Zugriff kann mit einem Verbindungsfehler scheitern.
`withTenant` und die öffentlichen Abfragen wiederholen deshalb (`db/retry.ts`, `mitColdStartRetry`).
`adminDb` (`db/admin.ts`) ist zusätzlich als Ganzes geschützt (`db/schutz.ts`, `mitColdStartSchutz`): Lesen und
`execute` bei jedem erkannten transienten Verbindungsfehler, Schreiben (insert/update/delete) und `transaction`
NUR bei Fehlern, bei denen die Anweisung sicher noch nicht lief (nie doppelt schreiben). drizzle verpackt
Datenbankfehler in "Failed query: …" — der echte Fehler steckt in `cause`, `retry.ts` prüft deshalb die
Fehlerkette. Neue Zugriffe über `adminDb` brauchen keinen eigenen Retry.

## Globale System-Einstellungen

`system_einstellungen` (Singleton, genau eine Zeile) und `warteliste` sind
bewusst OHNE `verein_id`/RLS — echte vereinsübergreifende Daten, kein
Mandantenbezug. Schreibzugriffe laufen deshalb direkt über `adminDb`
(nicht `withTenant`), siehe `app/system/actions.ts`. Das ist die
Ausnahme: für alles mit Vereinsbezug bleibt `withTenant` Pflicht.

## Hilfe-Artikel

Nutzer-facing Hilfetexte (z.B. Hallen-ID vs. Team-ID, Dienste-Bedarf,
Funktionsträger-Zuordnung) leben unter `/hilfe` — nur im eingeloggten
Zustand erreichbar (nicht in `publicRoutes` in `src/proxy.ts`, siehe
`hilfe/page.tsx`), damit der Footer-Link anonyme Besucher nicht auf eine
Login-Wand schickt. Weitere Artikel als zusätzliche Sections auf
derselben Seite ergänzen, statt vorschnell eine Mehrseiten-Struktur
aufzubauen. Der Zurück-Button oben führt über `components/zurueck-
button.tsx` (Browser-Historie statt fest verdrahtetem Linkziel) zur
vorherigen Seite zurück, egal von wo aus `/hilfe` verlinkt wurde — bei
weiteren Hilfe-Seiten dasselbe Muster verwenden.

## Mandantentrennung (RLS)

`src/db/tenant-isolation.test.ts` prüft direkt gegen echtes Postgres, dass
Verein A nie Daten von Verein B sehen/anlegen kann (siehe README "Tests").
Nach jeder Änderung an RLS-Policies (migrations/0001, 0006, 0012, 0026,
0043, 0047) oder an neuen `adminDb`/`users`-Zugriffen diesen Test laufen lassen
statt sich nur auf Code-Review zu verlassen. `"user"` hat bewusst KEINE
RLS (siehe Kommentar in 0001) — jede neue Query gegen `users` MUSS
`eq(users.vereinId, vereinId)` (oder Äquivalent) selbst mitbringen.

## Mobile-Optimierung

Die App wird überwiegend auf dem Handy genutzt — jede neue Seite/Komponente
muss auch bei ~375–390px Breite geprüft werden, nicht nur auf Desktop.
Zwei wiederkehrende Muster:

- **Header (Logo/Name + Aktionsleiste + Nav)**: wrapped die Aktionsleiste
  auf Mobile in eine eigene Zeile (kein Platz neben dem Logo), wirkt sie
  links gepackt mit Leerraum rechts unbalanciert — dort `justify-center
  md:justify-start` setzen (Referenz: `admin/(dashboard)/layout.tsx`,
  `profil/page.tsx`, `system/layout.tsx`/`system-nav.tsx`). Ein einzelner
  Logout-Button gehört auf Mobile mit in die oberste Zeile neben den Namen
  (`md:hidden` dort, `hidden md:block` an seiner sonstigen Stelle) statt
  als eigene, einsame Zeile.
- **Dichte Desktop-Layouts** (z.B. Monatsgitter-Kalender) lieber auf Mobile
  durch eine eigene, einfachere Ansicht ersetzen (`hidden md:block` +
  Mobile-Alternative) statt sie zu verkleinern — siehe
  `components/monats-kalender.tsx` (Agenda-Liste statt Gitter unter `md`).

Tabellen brauchen keine Sonderbehandlung: `components/ui/table.tsx`
wrapped bereits jede Tabelle in `overflow-x-auto`.

- **Lange Button-Labels**: `Button`/`SubmitButton`/`ConfirmSubmitButton`
  sind `whitespace-nowrap` (siehe `buttonVariants` in `ui/button.tsx`) —
  ein langes Label (z.B. eine Warnung im Text statt in einer Rückfrage)
  wrappt dadurch NICHT, sondern zwingt die ganze Seite auf schmalen
  Bildschirmen zum horizontalen Scrollen. Warnungen gehören deshalb in
  `confirmText` von `ConfirmSubmitButton`, nicht ins sichtbare Label
  (Beispiel/Fix: "Link neu generieren (alter Link wird ungültig)" →
  kurzes Label + `confirmText`, siehe `profil/zeitnehmerwart/page.tsx`).

## Öffentliche Vereinsseiten (`/verein/[slug]`, nuLiga-Sync)

- Daten kommen aus nuLiga (Parser + Sync in `src/lib/nuliga/`, Persistenz in
  den `liga_*`-Tabellen, öffentliche Abfragen in `lib/liga-oeffentlich.ts`).
  Die `liga_*`-Tabellen sind wie `system_einstellungen` bewusst OHNE
  `verein_id`/RLS (nur öffentliche Sportdaten, anonym gelesen, Schreiben nur
  über `adminDb`). Einzige Brücke zum Mandanten: `liga_verein.verein_id` —
  nur registrierte Vereine mit hinterlegter nuLiga-Vereins-ID haben eine Seite.
- **Datenschutz:** Die Parser-Typen (`nuliga/types.ts`) sind eine Whitelist.
  nuLiga zeigt in denselben Seiten Mannschaftsverantwortliche,
  Schiedsrichter (Name/Kürzel) und Kalender-Tokens — die dürfen nie
  persistiert werden. Ein Ergebnis wird nur aus einem `…MeetingReport`-Link
  gelesen, nie aus dem übrigen Inhalt der Ergebnis-Spalte. Ein "0:0" ist nur der Platzhalter vor dem Spiel (nuLiga legt den
  Spielbericht vorher an) und wird NICHT als Ergebnis gespeichert, auch nicht im Hallenplan-Import
  (`extrahiereErgebnis`) — ein Nichtantritt steht als eigener Marker (NH/NG). Neue Felder nur mit
  Test, dass die Platzhalter-Namen aus `__fixtures__/README.md` nicht
  auftauchen. Fixtures nie ungekürzt/mit echten Namen einchecken.
- **Teamidentität:** nie über den angezeigten Namen. Stabil sind
  `liga_mannschaft.schluessel` (Normalisierung, saisonübergreifend) und die
  nuLiga-IDs `group`/`teamtable` (je Saison). Ein Spiel ist eindeutig über
  `(gruppe, spielnummer)`.
- **Sync:** idempotent, fehlertolerant (unlesbare Seite löscht nichts),
  strikt sequenziell mit Mindestabstand (`nuliga/client.ts`). Cron
  `/api/cron/liga-sync` entscheidet je Verein selbst, was fällig ist
  (`sync-cron.ts`); er läuft tagsüber stündlich (5–21 Uhr UTC, ca. 6–23 Uhr deutsche Zeit; nachts nichts, `vercel.json`, braucht einen Vercel-Plan mit
  häufigen Crons — Pro; auf Hobby nur täglich). Dadurch werden Spiele am
  Spieltag öfter aktualisiert und ein wegen des Zeitlimits (40 s je Aufruf)
  unvollständiger Lauf wird beim nächsten Aufruf fortgesetzt, bis alles
  geladen ist. Reihenfolge: Vereine mit Spiel HEUTE zuerst, dann reihum der am längsten
  nicht VERSUCHTE (letztes Sync-Protokoll, nicht "zuletzt vollständig" — sonst blockiert ein nie fertig werdender
  Verein alle anderen); innerhalb eines Vereins Mannschaften mit Spiel heute oder einem Spiel von gestern ohne
  endgültiges Ergebnis (fehlt oder nur vorläufig) zuerst (so wird ein spät eingetragenes oder berichtigtes
  Ergebnis am nächsten Tag sicher nachgeladen) (`sortiereNachDringlichkeit`). Jeder Abruf hat eine harte Frist
  (`mitHarterFrist`, Frist + 8 s), damit der Lauf nie ins 60-s-Limit läuft. Funktionen laufen in
  `fra1` (`vercel.json` → `regions`), im selben Raum wie die Neon-Datenbank (eu-central-1): jede einzelne
  Abfrage über den Atlantik (iad1) kostete ~100 ms und brachte den Lauf ins Zeitlimit. Beim handball.net-Sync
  werden Tabellenzeilen und Spiele je Phase in EINER Anweisung geschrieben (`excluded`-Upsert).
- Der HHV hat dem automatischen Abruf zugestimmt (Zusage schriftlich
  ablegen). Weitere Landesverbände: Eintrag in `nuliga/verbaende.ts`.
- DB-Integrationstests (`nuliga/sync.test.ts`, `liga-oeffentlich.test.ts`)
  laufen nur mit `TEST_DATABASE_ADMIN_URL` (siehe `tenant-isolation.test.ts`);
  `fileParallelism` ist deshalb ausgeschaltet.
- **Zweite Quelle handball.net (DHB: 3. Liga, Jugendbundesliga, Quali):**
  `src/lib/handball-net/` (modell = reine Parser/Whitelist/Statusmapping/
  Normalisierung/Tabelle, client = HTTP, sync = Persistenz). Einstieg ist
  `liga_verein.handball_net_club_id` (+ optional manuelle Team-IDs). Dieselben
  `liga_*`-Tabellen: `liga_gruppe.quelle` = "nuliga" | "handball_net"
  (verband "DHB"); die Spalten `nuliga_group_id`/`nuliga_teamtable_id`/
  `halle_nuliga_id` tragen bei handball.net die externe Phasen-/Team-/Hallen-ID
  (Umbenennung steht aus). Spiele: `liga_spiel.spielcode` (offizielle
  DHB-Spielnummer, je Gruppe eindeutig) statt `spielnummer`. Jede Quelle
  synchronisiert unabhängig (`liga-sync-quellen.ts`, `sync-cron.ts`); der
  nuLiga-Sync fasst nur `quelle = 'nuliga'`-Teilnahmen an. Die API liefert
  auch Schiedsrichter, Zeitnehmer, Verantwortliche und Vereinskontakte — die
  Parser-Typen sind eine Whitelist, Personendaten dürfen nie persistiert werden
  (Test in `handball-net.test.ts`). Die Tabelle kommt von
  `/api/new/standings?phase_id=…` (`parseOffizielleTabelle`, Whitelist — die
  Antwort enthält Vereinsadressen/-kontakte); schlägt der Abruf fehl oder ist
  die Antwort unplausibel, wird sie aus den Phasenspielen BERECHNET (ohne
  direkten Vergleich).
  Kollidiert der Mannschaftsschlüssel mit einer aktiven nuLiga-Teilnahme
  derselben Saison, wird die DHB-Mannschaft getrennt geführt ("… (DHB)") und
  gemeldet. Noch offen: Dedupe über Quellen hinweg, Konfliktliste, Umbenennung
  der nuliga_*-Spalten.
- **Zusatzquellen (Spielgemeinschaften unter einem Partnerverein):**
  Läuft eine Mannschaft in nuLiga unter einem anderen Verein (z.B. eine
  Jugendspielgemeinschaft), trägt der Admin dessen nuLiga-Vereins-ID unter
  Einstellungen → Öffentliche Vereinsseite als Zusatzquelle ein
  (`liga_verein_zusatzquelle`, Filter über Kategorie und optional einen
  Namensteil — nie der ganze Partnerverein; der Namensteil wird gegen Vereinsliste
  UND den Namen in der Gruppentabelle geprüft, dort steht der Name der
  Spielgemeinschaft). `synchronisiereStruktur` liest
  deren clubTeams und legt die gefilterten Mannschaften unter dem eigenen
  `liga_verein` an (Filter rein in `nuliga/zusatzquellen.ts`); der Spiele-Sync
  braucht dafür keine Änderung. Ist eine Zusatzquelle nicht lesbar, wird nichts
  deaktiviert. Bei handball.net gibt es zwei Wege: manuelle Team-IDs
  (`handball_net_team_ids`, immer übernommen, auch wenn das Team zu einem anderen
  Verein gehört, `teamUebernehmen`) und dieselbe Zusatzquelle mit
  `handball_net_club_id` (Teamliste des Partnervereins, gefiltert über
  Kategorie/Namensteil, `passtZumHnetFilter`).
- **Freundschaftsspiele/Turniere (nuLiga „… FS …“) — ZUKÜNFTIGES FEATURE, derzeit
  abgeschaltet** (`FREUNDSCHAFTSSPIELE_AKTIV = false` in `nuliga/sync.ts`; Code und
  Tests bleiben, bereits geladene Daten bleiben bestehen). In der Vereinsliste
  stehen sie als eigene Mini-Gruppen (ein Spiel, Spielnummer 0, Tabelle ohne
  Aussage). `synchronisiereFreundschaftsspiele` (`nuliga/sync.ts`) lädt sie bei
  der passenden Mannschaft (Kategorie aus der Vereinsliste, Nummer aus dem
  Portrait, eigene Seite über die Vereins-ID im Portrait). `liga_gruppe`/
  `liga_spiel.ist_freundschaft` kennzeichnen sie: nie in Tabelle/Platz
  (`holeMannschaften` schließt sie aus der Hauptteilnahme aus), Struktur- und
  Spiele-Sync fassen sie nicht an. In den Spielzeilen trägt die EIGENE Seite
  die Teamtable der regulären Teilnahme, damit alle bestehenden Vergleiche
  („gegen“/„bei“, Hervorhebung) unverändert funktionieren. Noch offen:
  Freundschaftsspiele von Zusatzquellen (Partnerverein) und handball.net.
- **Aufbau der vereinsweiten Seite:** drei Bereiche als eigene Routen —
  `/verein/[slug]` (Letzte Ergebnisse, Startseite), `/spiele` (Nächste Spiele),
  `/mannschaften` — mit `components/liga/vereins-nav.tsx` (Bottom-Bar unter
  `md`, Tabs ab `md`; nur auf diesen drei Seiten sichtbar, deren Inhalt braucht
  `pb-28 md:pb-0`). Listen kommen aus `lib/liga-spiele-hilfen.ts`
  (`sammleVereinsSpiele`, rein/testbar), Filter-Chips aus
  `gefilterte-liste.tsx`. Statische Segmente `spiele`/`mannschaften` haben
  Vorrang vor `[team]`. Die Landingpage `/` zeigt die Vereinssuche zwischen Produkttour und Beta-Hinweis.
- **Eigene Mannschaftsnamen:** `liga_mannschaft.anzeigename_eigen` (Admin →
  Einstellungen → Öffentliche Vereinsseite) überschreibt `name` nur in der
  Anzeige (`holeMannschaften`); der Sync fasst es nie an, der Slug bleibt stabil.
- **Fan-Web-App (öffentlich):** Favoriten liegen NUR im Browser
  (`lib/liga-favoriten-lokal.ts`, localStorage, kein Konto, keine DB-Tabelle).
  Jeder Verein ist eine installierbare Web-App mit eigenem Namen, Farbe und
  Icon (`/verein/[slug]/manifest.webmanifest`, `/verein/[slug]/icon/[größe]`,
  Helfer in `lib/liga-pwa.ts`); `/meine` zeigt die Favoriten über
  `/api/liga/favoriten`. `public/sw.js` cached NUR öffentliche Seitenaufrufe
  (`/verein/…`, `/meine`) und `/api/liga/…` (network first) — nie
  Admin/Profil/Login. Die Farbüberschreibung gilt nur unter `.fan`.

## Treuhand: Verein einrichten, übergeben, Support-Zugriff

Der Systemadmin kann einen Verein im Hintergrund einrichten
(`/system/vereine` → „Verein vorbereiten"): `vereine.status = 'vorbereitung'`
(öffentlich unsichtbar, `sendMail` unterdrückt Mails an dessen Personen, siehe
`istEmpfaengerGesperrt`). Er arbeitet dann per Kontextwechsel im Admin-Bereich
des Vereins (Tabelle `treuhand_zugriff`, aufgelöst in
`holeKontextSession`/`requireSession` aus `lib/session.ts`, NICHT im JWT, daher
wirken Übergabe/Widerruf sofort; `session.user.treuhand` ist dann gesetzt, die
AVV-Pflicht entfällt für ihn). „Übergeben" legt den Vereinsadmin an, setzt
`status = 'aktiv'` und löscht jeden Treuhand-Zugriff (`lib/treuhand.ts`,
`uebergebeVerein`). Späterer Zugriff nur mit Support-Freigabe des
Vereinsadmins (`vereine.support_zugriff_bis`, 1/3/7 Tage, jederzeit widerrufbar;
ein Systemadmin im Treuhand-Kontext kann sie nie selbst erteilen). Alles wird in
`verein_protokoll` festgehalten und im Verein unter Einstellungen angezeigt.
`treuhand_zugriff`/`verein_protokoll` sind systemweit ohne RLS, `app_user` hat
KEINEN Zugriff (nur `adminDb`). Neue Seiten, die Vereine auflisten, müssen
`status = 'aktiv'` filtern; auf neue Mail-Wege greift die Sperre automatisch,
solange sie über `sendMail` laufen.

**Vorschau-Link für Vereine in Vorbereitung:** Für eine Demo (z.B. an
Interessenten) erzeugt der Systemadmin unter `/system/vereine` einen geheimen
Link `/verein/[slug]/vorschau/[token]` (1/3/7 Tage, widerrufbar, Tabelle
`verein_vorschau_link`, nur `adminDb`). Die Route setzt ein httpOnly-Cookie
`hp_vorschau` (Pfad "/", gilt nur für den einen Verein des Tokens) und leitet
um; `holeVerein`/`holeVorschau` (`lib/liga-oeffentlich.ts`) und die
Favoriten-API prüfen es bei JEDEM Aufruf (Ablauf/Widerruf wirken sofort).
Die Vorschau ist **genauso funktional wie die echte Seite** (alle Listen,
Mannschaften, Favoriten, installierbare Web-App) und nur zeitlich begrenzt;
zusätzlich Banner mit Ablaufdatum und `noindex`. Antworten, die vom Cookie
abhängen (Favoriten-API mit Vorschau-Verein), dürfen nie im gemeinsamen Cache
landen (`private, no-store`). Der Verein bleibt ohne Link 404 und taucht nicht
in Suche/Sitemap auf. Der einrichtende Systemadmin im Treuhand-Kontext sieht
die Seite ebenfalls.

## Hallenplan + öffentliche Liga-Daten zusammenführen (in Arbeit)

Ziel: Hallen-ID-Import und öffentlicher Liga-Sync liefern EINE Termin-Wahrheit,
ohne eingetragene Dienste (Funktionsträger) zu verlieren. Vorgehen in Stufen,
alles unter `/system/abgleich` (nur Systemadmin):
1. **Bericht + Trockenlauf** (`hallenplan-abgleich*.ts`): nur lesend.
2. **Verknüpfen** (`hallenplan-verknuepfung.ts`, `termin.liga_spiel_id`): speichert
   NUR den Verweis Termin → `liga_spiel` für sicher zugeordnete Termine. Ändert
   nichts sonst, löscht nichts, idempotent; Spiele, die mehrere Termine
   beanspruchen (Duplikate), bleiben unverknüpft. Test: Zuordnungen/Termin
   unverändert.
3. **Übernehmen** (`liga-uebernahme.ts`, Button je Verein in `/system/abgleich`,
   bewusst manuell/Pilot): legt fehlende KÜNFTIGE Heimspiele in eigener Halle still
   als Termin an (`icsUid` = `liga:<spielId>`, nie `rundenspiel:` — sonst würde die
   Aufräumlogik des Hallenplan-Imports sie löschen; `liga_spiel_id` gesetzt).
   Keine Mails, keine Änderung/Löschung bestehender Termine oder Zuordnungen
   (einzige Löschung: ein eigener LEERER `liga:`-Doppelgänger, sobald der
   Hallenplan das Spiel nachliefert; mit Diensten bleibt er und wird gemeldet).
   Zeit/Ort bestehender Termine (Verlegungen) behandelt weiter der Hallenplan-
   Import. Ansetzung/Dienste liegen nur in privaten Terminen, nie in `liga_*`.
   Automatisch: Schalter `vereine.liga_uebernahme_aktiv` (Default aus, je Verein
   unter `/system/abgleich`, nur Systemadmin); der eigene Cron `/api/cron/liga-uebernahme` (tagsüber stündlich wie der Sync,
   :30; NICHT im Liga-Sync-Cron — dessen 60-s-Limit reicht dafür nicht) ruft
   `uebernehmeFuerAktiveVereine` auf: am längsten ungeprüfte Vereine zuerst
   (`liga_uebernahme_geprueft_am`), Frist 45 s, Rest im nächsten Lauf
   (Protokolleintrag nur bei Änderung).
   **Ansetzung (nuLiga):** der eigene Cron `/api/cron/liga-ansetzung` (tagsüber stündlich um :15, Frist 40 s,
   `liga_gruppe.ansetzung_geprueft_am` für die Reihenfolge) liest je Gruppe die Seite
   "Spielplan (Gesamt)" (`groupPage?displayTyp=vorrunde|rueckrunde&displayDetail=meetings`;
   NUR dort steht die Ansetzung auch für weit entfernte Spiele — die Gruppenseite "Aktuell"
   zeigt nur die nächsten Tage, die Team-Seite gar keine) und schreibt das Schiedsrichter-Kürzel
   in die VERKNÜPFTEN privaten Termine von Vereinen mit eingeschalteter Übernahme
   (`lib/liga-ansetzung.ts`; nur setzen/ändern, nie löschen, still; Parser `parsers/ansetzung.ts`
   ist bewusst von der Whitelist der öffentlichen Parser getrennt, nie in `liga_*`). Der
   Hallenplan-Import füllt das Kürzel bei verknüpften Terminen nur noch, wenn es leer ist
   (`kuerzelFuerUpdate`) — kein Hin und Her. **handball.net-Ansetzung** (Schiedsrichter/Zeitnehmer
   mit Namen): derselbe Cron ruft danach `lib/liga-ansetzung-hnet.ts` auf (je Phase eine Abfrage
   `/api/new/matches?phase_id=…&date_from&date_to` über alle Seiten, Frist 45 s, Zuordnung über
   `liga_spiel.spielcode`) und schreibt `termin.handball_net_schiedsrichter/_zeitnehmer` (Form
   "Vorname Nachname, …" wie beim bisherigen Import, über `gruppiereSchiedsrichterUndZeitnehmer`);
   nur setzen/ändern, nie löschen, nie in `liga_*`. Der Team-Import füllt die Namen bei verknüpften
   Terminen von Vereinen mit eingeschalteter Übernahme nur noch, wenn sie leer sind. Vergleichswerkzeug: "Ansetzung vergleichen" in `/system/abgleich`.
   **Verlegung/Ergebnis:** `lib/liga-aenderungen.ts` (läuft im Übernahme-Cron nach dem Anlegen
   neuer Heimspiele) übernimmt für VERKNÜPFTE Termine eine neue Zeit (Halle nur ZUSAMMEN mit
   einer Zeitänderung; eine reine Hallenabweichung kann nur ein anderer Name sein und wird nicht
   übernommen) und Ergebnisse (nur bei gleicher Heim/Gast-Richtung; auch Korrekturen, z.B. ein vorläufiges Ergebnis,
   das später berichtigt wird — still, ohne Mail). Es ruft dafür den
   vorhandenen Import auf (`importiereRundenspielEreignisse(..., { quelle: "liga" })`): dieselben
   Regeln wie beim Hallenplan-Import — bei einer Verlegung entfallen die Dienste außer
   Schiedsrichter, die betroffenen Personen werden benachrichtigt, der Vereinsadmin nach seinem
   Opt-in. Bereits begonnene/vergangene Termine werden nicht mehr verlegt. Zusätzlich (Entscheidung 09.10.2026) bekommen bei JEDER Sync-Verlegung künftiger Spiele (Hallenplan, liga, handball.net) die für den Termin eingetragenen Schiedsrichter mit Login und die aktiven Trainer der Mannschaft eine Info-Mail (`sendeVerlegungAnSchiedsrichterUndTrainerBenachrichtigungen`, nicht abbestellbar; wer schon "Zuordnung entfernt" bekam, nicht doppelt). Spieler haben kein Konto, werden nicht informiert. Keine Sammelmail an Admins bei geänderten manuellen Terminen, `/hilfe` bekommt keine Bottom-Navigation (beides entschieden). Umgekehrt ändert der
   (tägliche) Hallenplan-Import Zeit/Halle/Ergebnis eines verknüpften Termins eines Vereins mit
   eingeschalteter Übernahme NICHT mehr (sonst setzt er öffentlich schon gemeldete Verlegungen
   zurück, beide Wege überschrieben sich stündlich inkl. Mails).
   Tests mit `withTenant` brauchen ein Mock von `@/db` (der App-Treiber ist Neon/WebSocket).
   **Abschalten des Hallenplan-Imports:** `vereine.hallenplan_import_aus` (Schalter je Verein in
   `/system/abgleich`, nur Systemadmin; abschaltbar nur bei eingeschalteter Übernahme UND ohne
   Handlungsbedarf, gemeinsame Prüfung `lib/abgleich-handlungen.ts`). Dann überspringen der nuLiga-
   Hallenplan-Cron, der handball.net-Teamimport und der Sofortimport beim Speichern der Hallen-IDs diesen
   Verein; vorhandene Termine/Dienste bleiben. Folge: Freundschaftsspiele/Turniere müssen von Hand
   angelegt werden (automatische Pflege in Entwicklung, steht so auch in Einstellungen/Hilfe).
   Die Abgleich-Seite ist bewusst schlank (nur offene Punkte, Schalter, aktuelle Vergleiche).
   Ort-Abweichungen werden einzeln geprüft ("Ort übernehmen" mit Mail an Betroffene / "Ort geprüft" =
   `termin.liga_ort_bestaetigt`); Import-Termine sind im Kalender nicht bearbeit-/löschbar.
   Standard von `liga_uebernahme_aktiv` ist jetzt an und `hallenplan_import_aus` ebenfalls an (= Import aus) für NEUE Vereine (Migrationen 0072/0073; neue Vereine brauchen nur die Vereins-ID plus "Eure Spielhallen", keine Hallen-ID); bestehende Vereine schaltet der
   Systemadmin einzeln ein. Einstellungen/Hilfe sind an die Zusammenführung angepasst: die Vereins-ID
   genügt, die Hallen-ID nur noch für Freundschaftsspiele/Turniere solange der Import an ist.

## Spielbericht-Link / Live-Ticker (Stand 04.10.2026, Analyse ohne Zugriff auf nuLiga)

- `liga_spiel.meeting_id` (nuLiga-Meeting-ID) gab es schon; neu: `liga_spiel.bericht_url` = Pfad+Query des
  `…MeetingReport`-Links aus dem Spielplan (`parsers/spielzeilen.ts` `berichtPfad`, keine Domain gespeichert).
  `baueBerichtUrl` (`nuliga/verbaende.ts`) setzt die Domain aus dem Verband davor; `SpielKarte` zeigt daraus
  "Spielbericht bei nuLiga". Beides wird NUR aus dem Spielplan-Link gelesen, nuLiga zeigt ihn offenbar erst, wenn
  der Spielbericht angelegt ist (deshalb auch das "0:0"-Platzhalterverhalten) — für Spiele davor ist `meeting_id` leer;
  ein Backfill ist ohne weitere Quelle nicht möglich, der Sync füllt es von selbst, sobald nuLiga den Link zeigt.
- `lib/liga-spiel-status.ts` (`spielPhase`): Anzeige-Phase aus gespeicherten Daten, bewusst OHNE "live".
- **nuScoreLive (Live-Ticker, vom Betreiber verifiziert):** eigene SPA `https://hbde-live.liga.nu/nuScoreLive/` mit
  Hash-Routen `#/groups/<GROUP>` und `#/groups/<GROUP>/meetings/<MEETING>` (`baueLiveStaffelUrl`/`baueLiveSpielUrl`
  in `nuliga/verbaende.ts`; Gruppen-ID kommt aus `bericht_url` (`&group=`), Meeting-ID aus `meeting_id`). `SpielKarte`
  zeigt "Live-Ticker" (nur 60 Min vor bis 4 h nach Anwurf, solange das Ergebnis nicht genehmigt ist: `liveTickerRelevant`) + "Spielbericht" (nur wenn ein Ergebnis angezeigt wird, also nicht bei Zwischenstand; über `lib/match-provider.ts`, `quelleFuer`). Eine Meeting-ID heißt NICHT, dass
  das Spiel live ist. Es gibt keinen verifizierten "LIVE"-Status, nur die Vermutung `laeuftVermutlich` (liga-spiel-status.ts: Spielbericht angelegt + kein oder noch nicht genehmigtes Ergebnis (nuLiga zeigt den Zwischenstand als "vorläufig") + Anwurf höchstens 90 Min her; dann Badge "Live", Label "live" (auf Wunsch des Betreibers ohne Altershinweis; Sync ist stündlich), kein Sieg/Niederlage-Streifen) (bleibt nur eine Vermutung).
- **Zwischenstände werden nie als Ergebnis gezeigt** (`istZwischenstand`, liga-spiel-status.ts): nuLiga zeigt während des Spiels den laufenden Stand als nicht genehmigtes Ergebnis, bei stündlichem Sync wirkt er sonst wie ein Endstand. Nicht genehmigtes Ergebnis + Anwurf höchstens 3 h her → Karte zeigt "Läuft gerade" (bis 90 Min) bzw. "Ergebnis folgt" statt der Zahl; Favoriten-API liefert dann `tore: null`, `formKurve` ignoriert es. Danach wie bisher mit "vorläufig".
- Liga-Sync von Hand: Systemseite `/system/sync` (Button, optional ein Verein; gleiche Logik wie der Cron, ohne CRON_SECRET).
- NICHT umgesetzt: `getLiveState` (Interface in `match-provider.ts`, nuLiga-Implementierung fehlt absichtlich), Spielstand/
  Events, Cache, Detailseite. Der Daten-Endpunkt der SPA ist nicht verifiziert (die Sandbox erreicht weder
  `hhv-handball.liga.nu` noch `hbde-live.liga.nu`; Domain-Freigabe oder Netzwerk-Tab-Daten der SPA nötig). Spiele ohne
  angelegten Spielbericht haben noch keine `meeting_id` und damit keinen Live-Link.

## Admin-Statistik

`/admin/statistik` (früher Abschnitt auf `/admin/dienste` = "Offene Dienste", gehört dort nicht hin): Spielbilanz je Mannschaft
über ALLE Spiele (Heim + Auswärts + Freundschaft) aus den öffentlichen Liga-Daten (`lib/spiel-statistik.ts`,
`holeMannschaftsBilanzenAlleSpiele`); ohne Liga-Daten Rückfall auf die alte Heimspiel-Bilanz aus dem Hallenplan.
Zwischenstände laufender Spiele (`istZwischenstand`) und Nichtantritte zählen nicht.

## Besetzung "Vollständig" und definierte Dienste

Ein Termin gilt im Admin-Kalender (Badge "Vollständig"/"Offen") und in "Unbesetzte Termine" (Dashboard) nur als vollständig, wenn
Schiedsrichter (falls vom Verein zu stellen), Zeitnehmer/Sekretär UND alle vom Verein definierten Helferdienste (Ordner,
Kioskdienst, Kassierer: Bedarf > 0 laut `bedarfFuer`, nicht für die Mannschaft abgeschaltet) ihren Bedarf erreichen.
Dasselbe Maß wie die Liste "Offene Dienste" (`berechneOffenePosten`).
Bedarf je Termin überschreiben: Zeitnehmerwart (`zeitnehmer_bedarf_override`, gilt für Zeitnehmer UND Sekretär) und Ordnerwart (`ordner_/kioskdienst_/kassierer_bedarf_override`, Migration 0094, `ordnerBedarfUeberschreiben`)
setzen pro Termin einen Wert (auch 0), null = Standard. `bedarfFuer(…, bedarfOverride, …)` bekommt den Override der jeweiligen Rolle über `bedarfOverrideFuer(termin, rolle)` — jeder Aufruf muss das tun, und jede
Abfrage, die Termine für `bedarfFuer` lädt, muss alle vier Override-Spalten mitselektieren (sonst gilt still der Standard).

## Dark Mode (Hell/Dunkel/Automatisch)

Klasse `dark` auf `<html>` (Variante `@custom-variant dark` in `globals.css`, `.dark`-Variablen dort). Ein Inline-Skript im Root-Layout setzt sie
VOR dem ersten Zeichnen: gespeicherte Wahl (`localStorage` `hp-theme` = `light`|`dark`), sonst Geräte-Einstellung (`prefers-color-scheme`,
reagiert live auf Änderungen). Umschalter "Automatisch / Hell / Dunkel" (`components/theme-umschalter.tsx`) in der globalen Fußzeile;
Wahl liegt nur im Browser (kein Konto). Neue Farben immer über die Design-Tokens (`bg-background`, `text-muted-foreground` ...) oder mit
`dark:`-Variante, nie feste Hellfarben. Fan-Seiten (`.fan`, Vereinsfarbe) haben eine eigene Dunkel-Variante `.dark .fan` (fan-rahmen.tsx).

## Eigene Vereinsfarbe (öffentliche Seite)

`liga_verein.farbton_eigen` (nur der Farbton 0-359, Migration 0077): der Admin wählt sie unter Einstellungen → Öffentliche Vereinsseite → Farbe
(Farbwähler, `lib/liga-farbe.ts` `hexZuFarbton`; Grau/Weiß/Schwarz werden abgelehnt). Vorrang: eigene Farbe vor Logo-Farbe
(`liga_verein_logo.farbton`) vor Standard aus dem Slug (`holeVereinsDesign`). Sättigung/Helligkeit legt `FanTheme` fest (lesbar in Hell/Dunkel);
die Version in `holeVereinsDesign` enthält die eigene Farbe, damit Icon-URLs der Web-App neu geladen werden.

## Vereins-Gesundheit (Systemadmin)

`/system/gesundheit`: je Verein "lebt / ruhig / inaktiv / nie benutzt" (letzte Aktivität = max aus `users.letzte_aktivitaet_am` und `letzter_login_am` über alle
Personen des Vereins: ≤ 7 Tage lebt, ≤ 30 ruhig), "online jetzt" (Aktivität ≤ 5 Min), Personen/Admins/schon angemeldet/mit Rolle, Mannschaften, künftige
Termine, Einteilungen (±30 Tage) und eine Einrichtungs-Checkliste (Admin angelegt + angemeldet, AVV, Mannschaften, Funktionsträger mit Rolle, künftige
Termine, öffentliche Seite). Nur Kennzahlen/Zeitstempel (`lib/verein-gesundheit.ts`, Bewertung rein in `verein-gesundheit-bewertung.ts`). Die
Aktivität schreibt `requireSession` über `markiereAktivitaet` (`lib/aktivitaet.ts`): eine bedingte Anweisung, höchstens alle 5 Minuten, nach der Antwort
(`after`); Systemadmins im Treuhand-/Support-Kontext zählen nicht als Aktivität des Vereins. Migration 0078.

## Zeitnehmer/Sekretär = EINE Funktion

In der Oberfläche gibt es nur "Zeitnehmer/Sekretär" (Anlegen, Rolle hinzufügen, Filter, Excel-Import, Anzeige als eine Rolle, Deaktivieren/Aktivieren gemeinsam);
in der DB bleiben es die zwei Rollen-Zeilen `zeitnehmer` + `sekretaer` (so laufen Zuordnung, Besetzung, Selbsteintragung unverändert). Die Umrechnung steht rein in
`lib/funktionstraeger-rollen.ts` (`expandiereRollenTypen`: die Sammelrolle UND jede der beiden Einzelrollen ergibt beide; `fasseRollenZusammen` für die Anzeige).
Neue Stellen, die Rollen anlegen, müssen `expandiereRollenTypen` nutzen. Das Lizenz-Datum wird beim Ergänzen der zweiten Rolle vom Partner übernommen.
Migration 0093 hat den Bestand einmalig angeglichen (wer nur eine der beiden hatte, bekam die andere dazu; Rollen mit unterschiedlichem Aktiv-Status bleiben unberührt).
Die öffentliche Eintragung (`/eintragen/[token]`) wählt die Aufgabe (Zeitnehmer ODER Sekretär) je Termin.

## Hilfe: wo Nutzer sie finden

Zwei Hilfeseiten: `/hilfe` (eingeloggt: Erste Schritte, Rollen, Kalender, Bedarf, Zuordnung, Mails, Statistik, Support; mit Inhaltsverzeichnis und Anker je Abschnitt)
und `/app-hilfe` (öffentlich, für Spieler/Eltern/Fans: Verein finden, App installieren, Favoriten, Live/Ergebnis folgt/vorläufig; in `publicRoutes`, verlinkt in
der Fußzeile für Besucher und auf der Startseite). Neue Funktion → Abschnitt mit Anker ergänzen UND dort, wo die Frage entsteht, ein
`<HilfeHinweis anker="…" />` (`components/hilfe-hinweis.tsx`) auf die Seite setzen (bisher: Kalender, Funktionsträger, Offene Dienste, Statistik, Mannschaften).

## Statistik-Reiter der öffentlichen App

Vierter Bereich `/verein/[slug]/statistik` (Reiter "Statistik" in `components/liga/vereins-nav.tsx`, 4 Spalten in der Bottom-Bar): Vereins-Kennzahlen und eine Karte je
Mannschaft (`components/liga/statistik-karte.tsx`): Bilanz, Siegquote, Tore, Heim/Auswärts, Tore pro Spiel, Form, höchster Sieg, torreichstes Spiel und (nur nuLiga, ab 3 Spielen mit
Pausenstand) Halbzeit-Auswertung. Rechnung rein in `lib/spiel-statistik.ts` (`berechneMannschaftsKennzahlen`); es zählen nur Spiele mit Ergebnis, nicht Zwischenstände
(`istZwischenstand`) und Nichtantritte. Keine Personendaten. Filter und Favoriten wie bei den anderen Bereichen (`GefilterteListe`).
Der Admin sieht dieselben Mannschaftskarten unter `/admin/statistik` ("Mannschaften im Detail", `holeMannschaftsKennzahlenAlleSpiele`).
Erweiterung (Schritt 2): Karte je Mannschaft hat zusätzlich Saisonverlauf (Punkte 2/1/0 nach jedem Spiel, SVG-Kurve) und "Duelle" (je Gegner Hin-/Rückspiel über die
Teamtable-ID, auch ausstehende); die Ergebnis-Seite zeigt oben "Diese Woche in Zahlen" (`berechneWoche`, Mo-So deutsche Zeit, jedes Spiel einmal). WICHTIG: `liga_spiel` enthält nur Spiele
der EIGENEN Mannschaften (nuLiga: Team-Portrait, handball.net: Abfrage mit team_id) — ein Tabellenverlauf (Platz je Spieltag) braucht alle Spiele der Staffel und damit einen erweiterten Sync.

## nuLiga-Vereinsindex und automatische Einrichtung (Systemadmin)

`nuliga_vereinsindex` (Migration 0079, nur `adminDb`, `app_user` ohne Zugriff) enthält ALLE Vereine des Verbands aus der nuLiga-Vereinssuche
(`clubSearch?federation=HHV`, Startseite → je Bezirk eine Seite; `parsers/vereinsuche.ts`, bewusst über Links statt Tabellenpositionen:
Anker mit `club=` = Verein, Anker mit `regionName=` = Bezirk). WICHTIG: die sichtbare Vereinsnummer (z.B. 14194) ist NIE die interne
club-ID (z.B. 76446) — nur die ID aus dem Link zählt, `nummer` wird getrennt geführt. Befüllt vom Cron `/api/cron/nuliga-vereinsindex` (täglich
3:20 UTC, Frist 45 s, `lib/nuliga/vereinsindex.ts`; ein Teillauf löscht nie, nur ein vollständiger Lauf entfernt Veraltetes) oder per Button.
`/system/vereine`: Suche im Index → "Automatisch einrichten" (`vereinAusNuligaEinrichten`): Verein in Vorbereitung anlegen, `liga_verein` mit
club-ID, Vereinsseite lesen (`parsers/vereinsinfo.ts`: Whitelist Name/Nummer/Gründung/Website/Stammvereine/Hallen — nie Telefon, E-Mail,
Anschrift, Ansprechpartner), Hallen als "Eure Spielhallen" vorschlagen, Mannschaften/Spiele laden, Termine anlegen; Ergebnis als Checkliste
(`einrichtung-status.ts`: ✓ automatisch / ! prüfen / ✕ Fehler) und im Vereinsprotokoll. Das Logo kommt dabei gleich mit (siehe unten). Die Fixtures `vereinsuche-bezirk.html`/`vereinsinfo.html` sind nach Beschreibung NACHGEBAUT, nicht von der echten Seite:
die Parser sind gegen die echte Struktur NICHT verifiziert (Warnungen statt Absturz) — sobald echtes HTML vorliegt, Fixture ersetzen.
Vom Betreiber bestätigt (09.10.2026): die nuLiga-Vereinssuche (Index, Automatisch einrichten) funktioniert. Unregistrierte Vereine haben keine öffentliche Seite/Favoriten (die liga_*-Tabellen hängen an einem registrierten Verein).

**Vereinslogo aus nuLiga (`lib/nuliga/logo.ts`):** Der Bildpfad (`…/wr?wodata=…`) wird bei JEDEM Abruf frisch aus der Vereinsseite gelesen (`parsers/vereinsinfo.ts`
`findeLogo`: Bild über die nuLiga-Bilderauslieferung, bevorzugt alt-Text = Vereinsname = `logoSicher`; ein einziger unklarer Kandidat wird nur als "bitte prüfen"
vorgeschlagen, mehrere unklare (Werbebanner) werden nie geraten). `wodata` ist NICHT stabil und wird nie als ID benutzt. Download nur über
`holeNuligaBild` (`client.ts`): nur https auf den Hosts aus `VERBAENDE`, nur `/wr?wodata=` (`istErlaubteNuligaBildUrl`, SSRF), Weiterleitungen nur auf ebenfalls freigegebene URLs,
Content-Type nur als Hinweis (nuLiga darf `application/octet-stream` liefern), entscheidend sind die Magic Bytes (`lib/bildtyp.ts`: png/jpeg/gif/webp, nie die Endung), höchstens 2 MB. Das Logo wird UNVERÄNDERT gespeichert (kein Zuschneiden/Quadrat/Neukodieren;
nur geprüft: `pruefeOriginalLogo`) in `liga_verein_logo` (Postgres bytea, KEIN Blob-Dienst; Spalte `mime`, Migration 0082; Uploads bleiben normalisierte PNGs), ausgeliefert über `/verein/[slug]/logo` mit gespeichertem MIME-Typ (nie Hotlink), Anzeige überall `object-contain`. Migration 0080: `liga_verein_logo.quelle` ("upload" | "nuliga"), `quell_pfad`, `quell_hash` (SHA-256 der Originaldatei),
`abgerufen_am`; `liga_verein.logo_geprueft_am`, `logo_auto_aus`. Regeln: ein hochgeladenes Logo (`quelle = upload`) wird nie überschrieben; entfernt der Verein sein Logo, wird `logo_auto_aus`
gesetzt (nicht neu holen; ein Upload hebt es auf); gleicher Hash = kein Neuverarbeiten und kein neuer Cache-Buster (`aktualisiert_am` bleibt); jede Prüfung setzt `logo_geprueft_am`.
Cron `/api/cron/nuliga-logos` (täglich 3:50 UTC, je Verein höchstens alle 7 Tage, Frist 40 s). Ohne Logo: Avatar mit Initialen (`components/liga/vereins-avatar.tsx`,
`vereinsInitialen`), nie ein kaputtes Bild; in der Vereinssuche (`/verein`, Startseite) angezeigt. Die Fixtures sind nachgebaut (siehe oben), die Bild-Erkennung gegen die echte Seite UNGEPRÜFT.

**Hallen auf der nuLiga-Vereinsseite:** kein Tabellenfeld, sondern ein Abschnitt "Hallen" mit Links (`findeHallen` in `parsers/vereinsinfo.ts`): ein Element, dessen ganzer Text "Hallen" ist, danach die Links bis zur
nächsten Überschrift bzw. zum Zeilenende der Tabelle; mit Nummer in Klammern zählen nur diese. `bereinigeHallenname` entfernt NUR eine abschließende `(Zahl)` (Nummer separat in `hallenNummern`). Die Struktur ist aus
der Beschreibung abgeleitet, nicht verifiziert — `/system/nuliga-diagnose` (nur Systemadmin, schreibt nichts) zeigt je club-ID Hallenabschnitt, Rohtexte, Logo-src, HTTP-Status, Content-Type, Größe und erkannten Bildtyp.

## Verein ansprechen (Instagram, von Hand)

Für Vereine in Vorbereitung zeigt `/system/vereine` unter "Verein ansprechen (Instagram)" (`components/verein-ansprechen.tsx`) einen Nachrichtenvorschlag (`lib/verein-ansprache.ts`
`ansprachetext`: Verein, Vorschau-Link, Beta-Phase/kostenlos, Gültigkeit, Absender = `ANSPRACHE_ABSENDER` ("Dennis"), durchgehend in der Sie-Form; bearbeitbar), "Text kopieren", "Instagram öffnen"
(`normalisiereInstagram`: nur Namen nach `[A-Za-z0-9._]`, fremde Adressen abgelehnt) und "angeschrieben am"/Notiz. Gesendet wird bewusst NIE automatisch (Instagram erlaubt keine automatisierten Erstnachrichten).
Die Notizen liegen in `verein_kontakt` (Migration 0083, nur `adminDb`, `app_user` ohne Zugriff — nie auf der mandantenfähigen Tabelle `verein`, der Verein darf sie nicht sehen); Protokoll "ansprache_angeschrieben".
Wenn sich die Konditionen ändern (Ende der Beta, Preis), den Text in `ansprachetext` anpassen. Rechtliche Prüfung unaufgeforderter Erstnachrichten bleibt offen.

**nuLiga-Diagnose (`/system/nuliga-diagnose`)** zeigt je club-ID: Club Page (HTTP, finale URL, Cookies nur als Namen), Stammdaten (VNr., Gründungsjahr, Website), Hallen (raw, bereinigt, Nummer, Quelle `club-page`), Logo
(img-src, aufgelöste URL) mit ZWEI Abrufen zum Vergleich (A wie der echte Download; B mit Browser-User-Agent, Referer und den Cookies der Vereinsseite) inkl. Weiterleitungskette, finalem Host, Content-Type, Content-Length, Bytes, ersten 32 Bytes (hex), erkanntem Format
(auch HTML/SVG, `beschreibeFormat`), Textvorschau/HTML-Titel bei Nicht-Bildern, dazu maskierte (E-Mail/Telefon) HTML-Auszüge um "Hallen"/"VNr"/"Gründung"/"www", alle `<img>`-Tags und den Quelltext zum Kopieren. Der echte Download meldet bei einer HTML-Antwort
"Logo-URL liefert HTML statt Bild" (statt "unbekanntes Format"). SVG ist bewusst noch NICHT erlaubt (Skripte): erst nach der Diagnose entscheiden, dann nur mit Bereinigung bzw. restriktiver Auslieferung (CSP `sandbox`).

**Befund aus der echten Diagnose (club=76446, 06.10.2026):** (1) Das Logo (`wr?wodata=…`) liefert OHNE die Cookies der Vereinsseite HTTP 200 mit 0 Bytes und ohne Content-Type; mit Cookies + Referer (und Browser-User-Agent) ein
PNG. Der echte Import holt deshalb die Vereinsseite mit `holeNuligaSeiteMitKontext` (Cookies `nusportingress`/`routeid_nuligahbde`, nur für den Folgeabruf an denselben freigegebenen Host, nie gespeichert/angezeigt) und lädt das Bild mit
Cookie + Referer (`SeitenKontext` an `holeNuligaBild`/`uebernehmeNuligaLogo`), weiterhin mit dem EHRLICHEN User-Agent (die Diagnose vergleicht A/C/D/B, um zu sehen, ob der User-Agent zusätzlich nötig ist — ungeprüft). 0 Bytes werden als solche gemeldet.
(2) Die `<h1>` der Vereinsseite enthält mehrere Zeilen (Verband, dann Verein): der Vereinsname ist die LETZTE Zeile. (3) Die Hallen werden auf der Vereinsseite erkannt (`findeHallen`, bestätigt). (4) VNr./Gründungsjahr/Website stehen nicht in einer
Zwei-Spalten-Tabelle: sie werden über die Beschriftung im sichtbaren Text gesucht (`VNr.`, `Gründungsjahr`, `Website`); die genaue Struktur der echten Seite ist weiterhin unbekannt (Diagnose-Auszüge liefern sie).

**Echte Struktur der Vereinsseite (clubInfoDisplay, club=76446, aus den Diagnose-Auszügen):** `<h1>` = Verband + `<br />` + Verein; EIN `<p>` mit "VNr.:&nbsp;14194, Gründungsjahr:&nbsp;2019 `<br/>` Stammvereine: A (14133), B (14146) `<br/>`";
"Hallen" als `<b>Hallen</b>` + `<ul><li><a href=".../courtInfo?…">Stadthalle Linden (14151)</a></li>…`; Logo `<img height="100" alt="<Vereinsname>" src="…/wr?wodata=…">`; danach `<h2>Kontaktadresse</h2>` mit einer Ansprechperson (wird NIE gelesen;
die Diagnose entfernt den Bereich per `entferneKontaktbereich`). Fixture: `__fixtures__/vereinsinfo-linden.html` (Strukturabbild, Kontaktdaten erfunden). Stammvereine stehen als Text im selben Absatz (`stammvereineAusHtml`), eine Website (HSG Linden hat keine)
steht entweder mit Beschriftung im Text oder als externer Link im Absatz mit "VNr." (`websiteAusStammdatenAbsatz`) — für die Website-Struktur z.B. von club=54040 fehlen noch echte Auszüge.

**Stammdaten am Verein (`lib/nuliga/stammdaten.ts`, Migration 0084):** `liga_verein.vereinsnummer`, `gruendungsjahr`, `website`, `stammvereine` (ein Name pro Zeile), `stammdaten_gelesen_am` — gelesen von der nuLiga-Vereinsseite beim automatischen Einrichten und im
Logo-Cron (`/api/cron/nuliga-logos`, nur Vereine ohne `logo_auto_aus`). Es wird nur gesetzt, was die Seite zeigt: ein nicht gefundener Wert überschreibt nie einen vorhandenen. Die Website wird immer als `https://` abgelegt (nuLiga liefert oft `http://`).
Mannschaften/Spiele kommen weiterhin über den Liga-Sync (`synchronisiereAlleQuellen`), Hallen als "Eure Spielhallen" (`vereine.eigene_hallen_namen`). Noch nicht angezeigt (öffentliche Vereinsseite zeigt weder Website noch Stammvereine).

**Mannschaften des Vereins aus den Liga-Mannschaften (`lib/nuliga/mannschaften-anlegen.ts`, Migration 0085):** Die vom Liga-Sync geladenen aktiven `liga_mannschaft`-Zeilen werden beim automatischen Einrichten (und danach bei jedem Lauf von
`uebernehmeLigaSpiele`) als Mannschaften des Vereins (Tabelle `mannschaft`) angelegt: Name = eigener Anzeigename sonst Quellname, `altersklasse` im Format des Hallenplan-Imports (`kategorieText`: "Mä/männl.", "mJC" …), `mannschaft.liga_mannschaft_id` = exakter
Verweis (SET NULL beim Löschen der Liga-Mannschaft). NIE umbenennen, löschen oder doppelt anlegen. Modus: Verein ohne Mannschaften -> alle anlegen; früher automatisch angelegt (mind. eine verknüpfte) -> neue Liga-Mannschaften ergänzen; Verein mit eigenen, unverknüpften
Mannschaften -> NICHTS anlegen (keine Dubletten zu selbst gewählten Namen). Neue Liga-Termine werden über den Verweis exakt zugeordnet (`baueMannschaftsAufloeser`: Teamtable-ID + Gruppe -> Teilnahme -> Liga-Mannschaft -> Vereins-Mannschaft; Heimmannschaft zuerst), sonst
wie bisher über den Namen (`findeMannschaft`); bereits angelegte Liga-Termine ohne Mannschaft werden nachträglich zugeordnet (`verknuepfeTermineMitMannschaften`, setzt nur leere Zuordnungen).

**Starthilfe für bereits registrierte Vereine (`/system/gesundheit`):** Aktive Vereine ohne öffentliche Seite (Einrichtungspunkt "Öffentliche Seite" fehlt) bekommen auf ihrer Gesundheits-Karte Vorschläge aus dem nuLiga-Index
(`findeIndexKandidaten`/`suchbegriffeAusVereinsname`, ohne schon vergebene club-IDs) mit "Importieren" (`starthilfeImportieren`, Rückfrage). Es läuft derselbe Ablauf wie bei "Automatisch einrichten"
(`lib/nuliga/einrichtung.ts` `fuehreNuligaEinrichtungAus`, geteilt) — OHNE Treuhand-Zugriff (nur adminDb), still (keine Mail) und nicht zerstörend: vorhandene Spielhallen werden nie überschrieben, Mannschaften nur nach den Regeln aus
`mannschaften-anlegen.ts`, ein eigenes Logo bleibt, Protokoll "starthilfe_nuliga". Ergebnis als Checkliste (`components/einrichtungs-checkliste.tsx`) oben auf der Gesundheitsseite. Der gemeinsame Ablauf schaltet `vereine.liga_uebernahme_aktiv` selbst ein (Protokoll `liga_uebernahme_an`), außer der Verein hat schon Termine aus dem Hallenplan-Import (`ics_uid` `rundenspiel:%`) — dann bleibt sie aus und die Checkliste verweist auf `/system/abgleich`.

## Gemeinsames Spiel-Modell und Spieltags-Sync (`src/lib/sources/`)

`match.ts` = gemeinsames Spiel-Modell (`Match`, Quellen `nuliga` | `handball-net` | `ndr`; Ligen `hbl1`/`hbl2`, je 34 Spieltage, `BUNDESLIGEN`), `normalisierung.ts` (`normalizeNuligaMatch`/`normalizeHandballNetMatch` aus gespeicherten liga_*-Zeilen, `normalizeNdrMatch` aus der Zwischenform),
`identitaet.ts` (Quellen-Identitäten eines Vereins; `verknuepfeExternesTeam` ordnet ein Team einem BESTEHENDEN Verein zu, legt nie einen Verein an, ein Team gehört genau einem Verein; Tabelle `liga_externe_identitaet`, nur adminDb).
`spieltag/` = quellenunabhängiges Gerüst für Quellen mit Spieltagsseiten: `html.ts` (kleiner abhängigkeitsfreier HTML-Baum; `textGetrennt` markiert Elementgrenzen mit " | "), `zeile.ts` (Zeilenerkennung über den sichtbaren Text: Datum, Uhrzeit, Ergebnis, Halbzeitstand, Statuswort),
`types.ts` (Zwischenform = Whitelist, keine Personen), `sync.ts` (`synchronisiereSpieltage` mit `SyncProfil`: nur FÄLLIGE Spieltagsseiten (`rundeFaellig`: nie geholt/Zuordnung geändert, Spieltag heute 10 Min., offene 6 Std., fertige 7 Tage; `?voll=1` nachts), Abruf-Status je Seite in `liga_quelle_abruf` (nur adminDb),
Tabelle von der Seite des aktuellsten begonnenen Spieltags, ein Fehler lässt Daten unberührt, gelöscht werden nur künftige Spiele zugeordneter Teams aus JETZT gelesenen Spieltagen; Mannschaft/Teilnahme/Spiele NUR für zugeordnete Teams, erste Männermannschaft unter `herren::1`, bei Kollision mit einer anderen Quelle getrennt "Männer (2. HBL)").
Kein "0:0" vor dem Anwurf; Live/Pause bleiben unbestätigt (`ergebnisBestaetigt` nur bei "Beendet"). Die frühere Quelle sport.de (HTTP 403) wurde vollständig entfernt (Migration 0089), ebenso opel-hbl.de.

## Aktuelle Quelle der 1./2. Bundesliga: ndr.de (Phase 1, vom Betreiber bestätigt: 1. und 2. HBL laufen)

sport.de antwortete mit HTTP 403 und wurde entfernt. Die Männer-Bundesligen kommen jetzt von den öffentlichen, serverseitig gelieferten Ergebnisseiten von **ndr.de** (kein Login,
keine private Schnittstelle, keine Browser-Tarnung; ehrlicher User-Agent). nuLiga/handball.net bleiben unverändert. Phase 1: Spielplan, Ergebnisse, Halbzeitstände, Tabelle — KEIN Live, keine Spielseiten (`ndrQuelle` in `match-provider.ts` liefert keine Links).

`src/lib/sources/ndr/`: `urls.ts` (1. HBL: `/sport/ergebnisse/handballmaenner-182~_matchDay-<n>.html`, je Spieltag eine Seite; 2. HBL: EINE Saisonseite `/sport/ergebnisse/Alle-Ergebnisse-2-Handball-Bundesliga-<Jahr>-<Jahr+1>%2Chandballmaenner-186.html` mit allen Spieltagen;
`findeSpieltagLinks` liest die `_matchDay-`-Links aus dem HTML selbst, die Diagnose zeigt sie), `parser.ts` (`parseNdrSeite`/`parseNdrSpieltag`: Abschnitte über die Überschriften "N. Spieltag" und "Tabelle N. Spieltag", Zeilen über den sichtbaren Text — nie nth-child/CSS-Klassen; Uhrzeit = Zahlenpaar VOR den Namen,
Ergebnis dahinter, Halbzeit "Halbzeit: d:d" oder "(d:d)"; ein einzelnes Paar hinter den Namen ohne Halbzeit ist die Anstoßzeit; Tabelle: Tordifferenz und Tore in beliebiger Reihenfolge, Beschriftungen wie "2 Spiele" werden entfernt; Logos nur https von ndr.de aus dem tatsächlichen `img/src`),
`client.ts` (nur `/sport/ergebnisse/…`, 1 s Abstand, `mitLaufCache`: dieselbe Seite je Lauf einmal), `sync-profil.ts` (Profil für den gemeinsamen Sync), `lauf.ts`, `diagnose.ts`.
**Der Sync liegt in `spieltag/sync.ts`** (`synchronisiereSpieltage` mit `SyncProfil`: quelle/verband/Adressen/Parser); Zwischenform-Typen heißen `Quell*`.
**Echte Struktur (per Diagnose 06.10.2026 bestätigt):** Abschnitt `<h2>N. Spieltag</h2>` + `<table class="results">`, je Spiel `<tr class="sport-match">` mit `span.date` ("27.08.", ohne Jahr), `div.time`, zwei Teamblöcken (Link `…~_gameplan-mannschafthandball276.html` = **stabile Team-ID** `mannschafthandball276`; `span.nb-xs` = Langname, `span.ob-xs` = Kurzname) und `td.erg` mit `span.finalresult` ("35:27") + `span.interimresult` ("(17:15)"). Die Spieltagsauswahl ist ein `<select>` (wird ignoriert). NDR liefert KEINE Spiel-IDs: Schlüssel `liga-<Startjahr>-<yy>-md<n>-<heim-id>_<gast-id>` (`matchSchluessel`) = `liga_spiel.spielcode`/`externe_id`; Team-Schlüssel = Team-ID aus dem Link (Fallback `name:<slug>`). Ältere Zuordnungen über `name:<slug>` werden beim Sync automatisch auf die Team-ID umgestellt. Die Tabellenzeile enthält Platzierungstext ("Champions League") und Kürzel — der Teamname kommt deshalb aus dem Teamlink (`span.nb-xs`), nicht aus dem Zeilentext. Verunreinigte alte `name:`-Zuordnungen werden beim Sync automatisch auf die Team-ID umgestellt.
Persistenz: `liga_gruppe.quelle = "ndr"`, `verband = "NDR"`, `nuliga_group_id = "<liga>:<saison>"`; Team ↔ Verein über `liga_externe_identitaet` (quelle "ndr", Migration 0088 mit Unique-Index, `verknuepfeExternesTeam`; nie ein automatisch neuer Verein; Vereinslogo hat Vorrang vor dem NDR-Logo, das nur in der Identität liegt).
Status: Ergebnis vorhanden = finished (nur dann `ergebnisBestaetigt`), sonst scheduled bzw. unbekannt, wenn der Termin schon vorbei ist. Cron `/api/cron/ndr-sync?liga=hbl1|hbl2` (tagsüber alle 15 Min., nachts `&voll=1`), holt nur FÄLLIGE Spieltage (Fälligkeit siehe oben) und tut nichts ohne Team-Zuordnung.
Systemseite `/system/ndr` (Reiter "Bundesliga"): Jetzt laden, Teams zuordnen/lösen, "Testimport (nur lesen)" je Liga/Spieltag (Spiele, Teams, Spieltage, aktueller Spieltag, Tabellenzeilen, Parsingfehler, Link-Formen, Bild-Hosts, maskierte HTML-Auszüge).
**OFFEN:** Die Fixtures (`ndr/__fixtures__/`) sind der echten Spielzeilen-Struktur NACHGEBAUT (Tabellenzeile geraten, 2. HBL-Seite nicht im Original gesehen) — echte HTML-Auszüge würden sie ersetzen; bei Layoutänderung zeigt `/system/ndr` → Testimport, was der Parser sieht. Die Vereinsseite nennt NDR in der Quellenzeile (`StandHinweis`). Live-Ticker: der NDR-Link `spielstatistik-NNNN` ist laut Betreiber ein Live-Ticker, `ndrQuelle.liveUrl` zeigt ihn deshalb im Live-Fenster (Karte: "Live-Ticker"), danach als "Spielbericht" (kein eigener Live-Stand, nur der Link). Spielort, Spielseiten, Tabellenverlauf, Caching-Feinschliff folgen später; die 2. HBL-Saisonseite hängt im Pfad an der Saison (`saisonLabel`).

## Beta-Konditionen (Stand 07.10.2026)

`lib/beta-konditionen.ts` hält die Zahlen an EINER Stelle: Beta voraussichtlich bis 30.11.2026, Beta-Vereine zahlen danach 200 € statt 300 € im Jahr, optional ein Sponsor (Sponsorenbild "Präsentiert von …"): er zahlt ALLES — 200 € im Jahr für den Sponsor-Platz plus den Vereinspreis von 200 €, der Verein zahlt dann nichts. Alle Preise NETTO (zzgl. MwSt.).
Angezeigt auf der Startseite (Infokasten unter den Beta-Plätzen), auf `/registrieren` (Kurztext) und im Ansprache-Text (`ansprachetext`, höchstens 1000 Zeichen). Dazu `KEIN_RISIKO`: vor Ende der Beta kann der Verein einfach absagen, dann wird alles gelöscht und es fallen keine Zahlungen an (Startseite und `/registrieren`). Bei Änderung nur die Konstanten anpassen. Der Badge "Beta · 100% kostenlos" bleibt, solange die Beta läuft.

## Abrechnung / Live-Gang (Stand 07.10.2026, Rechnung von Hand)

Pro Verein (`verein`, Migration 0090): `tarif` ("befreit" | "beta" 200 € | "regulaer" 300 €, netto/Jahr), `sponsor_uebernimmt` (Sponsor zahlt ALLES: Vereinspreis + 200 € Werbeplatz = z.B. 400 € bei Beta; der Verein zahlt dann nichts und bekommt keine Zahlungsmails),
`rechnung_email` + `rechnung_ansprechpartner` (bei der Registrierung abgefragt, im Verein unter Einstellungen → "Vereinsdaten und Rechnung" pflegbar; Anschrift = `strasse/plz/ort`), `zahlung_bis` (bezahlt bis, setzt NUR der Systemadmin), `zahlung_faellig_am` (erste Frist, solange noch nichts bezahlt ist),
`zahlung_sperre_aus` (Sperre aussetzen), `zahlung_mail_marke` (letzte verschickte Mail-Stufe der Periode). Alles Rechnerische rein in `lib/abrechnung.ts` (`betragNetto`, `zahlungsStand`, `startKonditionen`, `vorschlagBezahltBis`, Mail-Stufen), getestet.
Regeln: Beta endet mit dem 30.11.2026 (`BETA_ENDE_ZEITPUNKT`). Vorher registrierte Vereine = Beta-Tester (Standard `tarif = beta`, erste Frist 31.12.2026, Rechnung ab 1.12.); danach registrierte = `regulaer` mit 30 Tagen Zahlungsfrist ab Registrierung
(`legeVereinMitAdminAn` setzt das über `startKonditionen`; nach dem Beta-Ende ist die Rechnungs-E-Mail bei `/registrieren` Pflicht, Startseite/Registrierung zeigen dann den Preis). Je Verein verschiebbar: `/system/abrechnung` → "Erstes Zahlungsziel" (`zahlungszielSetzen` setzt `zahlung_faellig_am`, leer = Standard; Mail-Marke wird zurückgesetzt; ein unbezahlter Verein ist kostenlos, bis das Ziel höchstens 30 Tage entfernt ist). Zahlungsperiode = 12 Monate ab Zahlungsbeginn; "bezahlt bis" schlägt die App vor, der Systemadmin kann es ändern.
Zugang: sofort nutzbar; fällig + 30 Tage Karenz ohne Zahlung = gesperrt (`istVereinGesperrt` in `requireSession` → `/gesperrt`, nicht für Systemadmins/Treuhand; Fehler beim Prüfen sperren nie). "befreit" (z.B. Dutenhofen, TSF) und Vereine in Vorbereitung werden nie gesperrt, Sperre je Verein aussetzbar.
Systemseite `/system/abrechnung` (Reiter "Abrechnung"): je Verein Status, Betrag, Rechnungsdaten zum Kopieren, "Als bezahlt markieren" (Datum), Tarif/Sponsor, Sperre aussetzen; Protokoll im Verein. Cron `/api/cron/zahlung` (täglich 6:10 UTC, `lib/zahlung-erinnerung.ts`): je Periode und Stufe EINE Mail
(1 = ≤ 30 Tage vor Ablauf bzw. erste Rechnung fällig, 2 = überfällig, 3 = gesperrt) an alle Systemadmins und an Vereinsadmins + Rechnungs-E-Mail (nicht abbestellbar). Vereinsadmins sehen im Admin-Bereich einen Hinweis (`components/zahlungs-hinweis.tsx`). "Als bezahlt markieren" schickt dem Verein (Admins + Rechnungs-E-Mail, nie befreit/Sponsor) eine kurze Bestätigung mit dem Datum (`sendeZahlungBestaetigung`, best-effort, Fehler brechen die Aktion nicht ab).
Vorab-Ankündigung: Beta-Vereine (aktiv, `tarif = beta`, kein Sponsor, noch nichts bezahlt) bekommen ab 30 Tagen vor dem Beta-Ende EINE Mail (`betaEndeInhalt`, `sollBetaEndeMailSenden`, Marke `beta-ende:0` in `zahlung_mail_marke`, im selben Cron): Beta endet, ab 1.12. kostenpflichtig (200 € netto), Zugang wird ohne Zahlung deaktiviert (Daten bleiben), Ausstieg über Einstellungen → Gefahrenzone → „Verein löschen“ oder per Mail. Bei geänderten Konditionen den Text anpassen.
Noch NICHT automatisiert: Rechnungsstellung/-nummer, Sponsor-Rechnungsanschrift (Sponsor wird bei `/system/sponsor` gepflegt, hier nur das Kennzeichen), Zahlungseingang. Das Beta-Vereinslimit (`betaVereinLimit`, Warteliste) gilt weiterhin, solange es nicht erhöht wird.

## Systemadmin-Portal: Navigation

`lib/system-navigation.ts` (`SYSTEM_BEREICHE`) ist die EINE Quelle für die Navigation: fünf Bereiche — Übersicht, Vereine (Vereine · Warteliste · Gesundheit), Abrechnung (Abrechnung · Sponsor), Spieldaten (Liga-Sync · Bundesliga · Abgleich · nuLiga-Diagnose),
Betrieb (Feedback · Mail-Test). `components/system-nav.tsx` zeigt oben die Bereiche und darunter die Unterseiten des aktuellen Bereichs; `system/layout.tsx` leitet daraus auch die Bottom-Bar auf dem Handy ab (die ersten vier Bereiche, der Rest unter "Mehr").
Die Seiten liegen unverändert unter `/system/…`. Neue Systemseite: in `SYSTEM_BEREICHE` unter dem passenden Bereich eintragen (Test `system-navigation.test.ts` prüft, dass jede Seite genau einmal vorkommt).
