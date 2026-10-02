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
  gelesen, nie aus dem übrigen Inhalt der Ergebnis-Spalte. Neue Felder nur mit
  Test, dass die Platzhalter-Namen aus `__fixtures__/README.md` nicht
  auftauchen. Fixtures nie ungekürzt/mit echten Namen einchecken.
- **Teamidentität:** nie über den angezeigten Namen. Stabil sind
  `liga_mannschaft.schluessel` (Normalisierung, saisonübergreifend) und die
  nuLiga-IDs `group`/`teamtable` (je Saison). Ein Spiel ist eindeutig über
  `(gruppe, spielnummer)`.
- **Sync:** idempotent, fehlertolerant (unlesbare Seite löscht nichts),
  strikt sequenziell mit Mindestabstand (`nuliga/client.ts`). Cron
  `/api/cron/liga-sync` entscheidet je Verein selbst, was fällig ist
  (`sync-cron.ts`); er läuft stündlich (`vercel.json`, braucht einen Vercel-Plan mit
  häufigen Crons — Pro; auf Hobby nur täglich). Dadurch werden Spiele am
  Spieltag öfter aktualisiert und ein wegen des Zeitlimits (40 s je Aufruf)
  unvollständiger Lauf wird beim nächsten Aufruf fortgesetzt, bis alles
  geladen ist.
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
  `pb-20 md:pb-0`). Listen kommen aus `lib/liga-spiele-hilfen.ts`
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
   unter `/system/abgleich`, nur Systemadmin); der eigene Cron `/api/cron/liga-uebernahme` (stündlich,
   :30; NICHT im Liga-Sync-Cron — dessen 60-s-Limit reicht dafür nicht) ruft
   `uebernehmeFuerAktiveVereine` auf: am längsten ungeprüfte Vereine zuerst
   (`liga_uebernahme_geprueft_am`), Frist 45 s, Rest im nächsten Lauf
   (Protokolleintrag nur bei Änderung).
   **Ansetzung (nuLiga):** der eigene Cron `/api/cron/liga-ansetzung` (:15/:45, Frist 40 s,
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
   übernommen) und Ergebnisse (nur bei gleicher Heim/Gast-Richtung). Es ruft dafür den
   vorhandenen Import auf (`importiereRundenspielEreignisse(..., { quelle: "liga" })`): dieselben
   Regeln wie beim Hallenplan-Import — bei einer Verlegung entfallen die Dienste außer
   Schiedsrichter, die betroffenen Personen werden benachrichtigt, der Vereinsadmin nach seinem
   Opt-in. Bereits begonnene/vergangene Termine werden nicht mehr verlegt. Umgekehrt ändert der
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
   Standard von `liga_uebernahme_aktiv` ist jetzt an (neue Vereine); bestehende Vereine schaltet der
   Systemadmin einzeln ein. Einstellungen/Hilfe sind an die Zusammenführung angepasst: die Vereins-ID
   genügt, die Hallen-ID nur noch für Freundschaftsspiele/Turniere solange der Import an ist.
