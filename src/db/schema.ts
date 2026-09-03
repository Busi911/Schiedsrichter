import {
  type AnyPgColumn,
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const funktionstraegerTypEnum = pgEnum("funktionstraeger_typ", [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "trainer",
  "ordner",
  "kioskdienst",
  // Übersicht über alle Schiedsrichter/Einsätze im Verein (Ressourcenplanung,
  // offene Stellen, Statistik) sowie Zuordnen/Entfernen beschränkt auf die
  // Rolle "schiedsrichter" — siehe /profil/schiedsrichterwart. Wie jede
  // andere Funktionsträger-Rolle mehrfach vergebbar und unabhängig von
  // istAdmin bzw. einer eigenen "schiedsrichter"-Rolle derselben Person.
  "schiedsrichterwart",
  // Analog zu "schiedsrichterwart", aber für die Rollen "zeitnehmer" UND
  // "sekretaer" zusammen (die beiden werden in der Besetzung ohnehin
  // gemeinsam gezählt, siehe berechneBesetzung in besetzung.ts) — siehe
  // /profil/zeitnehmerwart.
  "zeitnehmerwart",
  // Analog zu "schiedsrichterwart", aber für "ordner" UND "kioskdienst"
  // zusammen — anders als Schiedsrichter/Zeitnehmer/Sekretär liefen diese
  // beiden Rollen bisher NUR über Selbst-Anmeldung (siehe
  // SELBST_ANMELDBARE_TYPEN in profil/actions.ts); der Ordnerwart kann
  // zusätzlich manuell zuordnen — siehe /profil/ordnerwart.
  "ordnerwart",
]);

export const terminTypEnum = pgEnum("termin_typ", [
  "spiel_ics",
  "testspiel",
  "turnier",
  // Einzelnes Spiel innerhalb eines Turniers (siehe termine.turnierId) —
  // Dienste-Bedarf (Ordner/Kiosk) gilt weiterhin nur für den Turnier-
  // Container selbst (typ "turnier"), nicht für jedes Einzelspiel.
  "turnier_spiel",
  // Pflichtspiel aus dem Liga-Spielplan, importiert aus einem nuLiga-JSON-
  // Export pro Halle (siehe src/lib/rundenspiel-import.ts). Enthält alle
  // Spiele an der eigenen Halle, nicht nur die der eigenen Mannschaften —
  // relevant für Ordner-/Kioskdienst-Bedarf am Spieltag.
  "rundenspiel",
]);

export const terminQuelleEnum = pgEnum("termin_quelle", [
  "ics_feed",
  "manuell",
  "rundenspiel_import",
]);

export const zuordnungQuelleEnum = pgEnum("zuordnung_quelle", [
  "zugeordnet_durch_admin",
  "selbst_angemeldet",
  // Über die öffentliche, login-freie Selbsteintragung (siehe
  // vereine.zeitnehmerSelbstanmeldungToken und
  // /zeitnehmer-eintragen/[token]) — anders als "selbst_angemeldet" ohne
  // Session, daher eigener Wert für Nachvollziehbarkeit.
  "selbst_eingetragen_oeffentlich",
  // Automatisch beim handball.net-Sync übernommen, weil der von handball.net
  // gemeldete Name exakt zu einem bereits angelegten Funktionsträger passt
  // (siehe ordneHandballNetBesetzungZu in handball-net-zuordnung.ts) — kein
  // manueller Zuordnungs-Klick, daher eigener Wert statt
  // "zugeordnet_durch_admin".
  "handball_net_uebernommen",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "noch_nie",
  "erfolgreich",
  "fehler",
]);

// Feinere Unterscheidung innerhalb "kein Pflichtspiel" (pflichtspiel = false,
// siehe termine.pflichtspiel) — welche der beiden nuLiga-Rundenspiel-Import
// erkennt anhand unterschiedlicher Signale (Rohtext-Präfix bzw. Rundenturnier-
// Spielplan-Muster, siehe rundenspiel-import.ts). null = nicht zutreffend
// (Pflichtspiel oder ein anderer Termin-Typ) ODER erkennbar nicht eindeutig
// (Fallback-Anzeige "Freundschaftsspiel/Turnier").
export const freundschaftsTypEnum = pgEnum("freundschafts_typ", [
  "freundschaftsspiel",
  "turnier",
]);

// ---------------------------------------------------------------------------
// Mandant / Vereinsstruktur
// ---------------------------------------------------------------------------

export const vereine = pgTable("verein", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  adresse: text("adresse"),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
  // Dienste-Bedarf (Ordner/Kioskdienst) pro Termin-Typ. Gilt bewusst NICHT
  // für spiel_ics: das sind die persönlichen Einsätze des Schiedsrichters
  // (oft bei fremden Vereinen), nicht Termine, bei denen der eigene Verein
  // Ordner/Kioskdienst-Personal am eigenen Veranstaltungsort braucht.
  testspielOrdnerBedarf: integer("testspiel_ordner_bedarf").notNull().default(0),
  testspielKioskdienstBedarf: integer("testspiel_kioskdienst_bedarf")
    .notNull()
    .default(0),
  turnierOrdnerBedarf: integer("turnier_ordner_bedarf").notNull().default(0),
  turnierKioskdienstBedarf: integer("turnier_kioskdienst_bedarf")
    .notNull()
    .default(0),
  rundenspielOrdnerBedarf: integer("rundenspiel_ordner_bedarf")
    .notNull()
    .default(0),
  rundenspielKioskdienstBedarf: integer("rundenspiel_kioskdienst_bedarf")
    .notNull()
    .default(0),
  // Mindestanzahl Zeitnehmer/Sekretär pro Termin-Typ (bisher hart 1 in
  // src/lib/besetzung.ts) — analog zum Ordner-/Kioskdienst-Bedarf oben,
  // ebenfalls nicht für spiel_ics (persönliche Einsätze des
  // Schiedsrichters, siehe bedarfFuer in src/lib/dienste.ts). Default 1
  // entspricht dem bisherigen festen Verhalten.
  testspielZeitnehmerBedarf: integer("testspiel_zeitnehmer_bedarf")
    .notNull()
    .default(1),
  turnierZeitnehmerBedarf: integer("turnier_zeitnehmer_bedarf")
    .notNull()
    .default(1),
  rundenspielZeitnehmerBedarf: integer("rundenspiel_zeitnehmer_bedarf")
    .notNull()
    .default(1),
  // Automatischer nuLiga-Rundenspiel-Import (siehe src/lib/nuliga-scraper.ts):
  // bis zu drei Hallen-IDs (dieselben Angaben wie im bisherigen manuellen
  // Export-Workflow), Import läuft nur, wenn aktiviert UND mindestens eine
  // Hallen-ID gesetzt ist (siehe /api/cron/rundenspiel-sync).
  nuligaHalle1Id: text("nuliga_halle_1_id"),
  nuligaHalle2Id: text("nuliga_halle_2_id"),
  nuligaHalle3Id: text("nuliga_halle_3_id"),
  nuligaAutoImportAktiviert: boolean("nuliga_auto_import_aktiviert")
    .notNull()
    .default(false),
  // Opt-in für den Vereinsadmin: E-Mail bei geänderten Spielen (Zeit/Ort
  // verlegt) bzw. neu eingetragenen Ergebnissen im Hallenspielplan, siehe
  // rundenspiel-benachrichtigung.ts. Default false, da nicht jeder Verein
  // diesen zusätzlichen Kanal will (die Änderungen sind im
  // Hallenspielplan-Tab von /admin/termine ohnehin jederzeit passiv
  // einsehbar).
  rundenspielAenderungenBenachrichtigungAktiviert: boolean(
    "rundenspiel_aenderungen_benachrichtigung_aktiviert"
  )
    .notNull()
    .default(false),
  // Öffentlicher, login-freier Link für Zeitnehmer/Sekretär-
  // Selbsteintragung (siehe /zeitnehmer-eintragen/[token]) — vom
  // Zeitnehmerwart aktivierbar. null = (noch) nicht aktiviert. Analog zu
  // termine.freigabeToken: Kenntnis des Links ist die Berechtigung.
  zeitnehmerSelbstanmeldungToken: text(
    "zeitnehmer_selbstanmeldung_token"
  ).unique(),
  // Analog zu zeitnehmerSelbstanmeldungToken oben, aber für Ordner/
  // Kioskdienst (siehe /ordner-eintragen/[token]) — vom Ordnerwart
  // aktivierbar.
  ordnerSelbstanmeldungToken: text("ordner_selbstanmeldung_token").unique(),
});

export const mannschaften = pgTable("mannschaft", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  altersklasse: text("altersklasse"),
  // Ab der 3. Liga läuft der Spielbetrieb zentral über handball.net statt
  // über die (Landesverbands-)nuLiga-Instanz (siehe
  // src/lib/handball-net-scraper.ts) — dort gibt es keine Hallen-, sondern
  // nur eine Mannschafts-Abfrage, daher die Team-ID hier statt bei den
  // Verein-weiten nuLiga-Hallen-IDs (siehe nuligaHalle1Id oben). Aus der URL
  // der Team-Seite ablesbar, z.B. bei handball.net/team/69770 ist die
  // Team-ID 69770.
  handballNetTeamId: text("handball_net_team_id"),
  // Vom jeweiligen Wart pro Mannschaft abschaltbar, wenn diese Mannschaft
  // grundsätzlich keinen Ordner-/Kioskdienst-/Zeitnehmer-Bedarf hat (z.B.
  // eine Jugend-Mannschaft ohne eigene Heimspiele mit Publikum) — siehe
  // bedarfFuer in src/lib/dienste.ts. Gilt für ALLE Termin-Typen dieser
  // Mannschaft (testspiel/turnier/rundenspiel gleichermaßen), nicht nach
  // Termin-Typ unterscheidbar. Wirkt live: bereits bestehende offene
  // Termine der Mannschaft gelten sofort als "kein Bedarf" (bedarfFuer wird
  // bei jeder Anzeige/Auswertung neu berechnet, kein Snapshot pro Termin).
  ordnerBedarfDeaktiviert: boolean("ordner_bedarf_deaktiviert")
    .notNull()
    .default(false),
  kioskdienstBedarfDeaktiviert: boolean("kioskdienst_bedarf_deaktiviert")
    .notNull()
    .default(false),
  zeitnehmerBedarfDeaktiviert: boolean("zeitnehmer_bedarf_deaktiviert")
    .notNull()
    .default(false),
});

// Vom Admin bewusst übersprungene Vorschläge aus "Unbekannte Mannschaften"
// (siehe gruppiereUnbekannteMannschaften in rundenspiel-import.ts) — meist
// Mannschaften anderer Vereine, die an der eigenen Halle spielen und nie
// als eigene Mannschaft angelegt werden sollen (siehe Hinweis im
// Hallenspielplan-Tab von /admin/termine). Ohne diese Tabelle würde
// derselbe Vorschlag bei jedem weiteren Import wieder auftauchen.
export const ignorierteMannschaften = pgTable(
  "ignorierte_mannschaft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vereinId: uuid("verein_id")
      .notNull()
      .references(() => vereine.id, { onDelete: "cascade" }),
    // Normalisierter Name (siehe normalisiereMannschaftsname) statt
    // Rohtext, damit z.B. "Herren I" und "Herren 1" nicht als zwei
    // getrennte Ablehnungen behandelt werden.
    normalisierterName: text("normalisierter_name").notNull(),
    kategorie: text("kategorie"),
    erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ignorierte_mannschaft_verein_name_kategorie_idx").on(
      t.vereinId,
      t.normalisierterName,
      t.kategorie
    ),
  ]
);

// ---------------------------------------------------------------------------
// Auth.js (Drizzle-Adapter) — erweitert um verein_id/ist_admin für Mandanten
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Fachliche Erweiterung gegenüber dem Standard-Auth.js-Schema:
  vereinId: uuid("verein_id").references(() => vereine.id, {
    onDelete: "cascade",
  }),
  istAdmin: boolean("ist_admin").notNull().default(false),
  // Sieht dieselben /admin-Seiten wie istAdmin, kann aber nirgends etwas
  // ändern — jede schreibende Server-Action prüft zusätzlich
  // requireAdminSchreibzugriff() (siehe lib/session.ts), das nur istAdmin
  // durchlässt. Für Personen, die z.B. nur mitlesen/kontrollieren sollen
  // (Kassenprüfer, zweiter Vorstand), ohne versehentlich etwas ändern zu
  // können.
  istAdminLesend: boolean("ist_admin_lesend").notNull().default(false),
  // Vereinsübergreifende Rolle (kein vereinId nötig): kann neue Vereine
  // anlegen, siehe /system/vereine. Löst den SETUP_SECRET-Bootstrap für den
  // Regelbetrieb ab (der bleibt als Notfall-Fallback bestehen).
  istSystemAdmin: boolean("ist_system_admin").notNull().default(false),
  // Selbstverwaltung durch die Person selbst (siehe /profil) — bewusst ohne
  // E-Mail-Änderung, die bleibt Admin-Aufgabe (login-kritisch, siehe
  // updateFunktionstraeger in admin/actions.ts).
  telefonnummer: text("telefonnummer"),
  // Passwort-Login als Alternative zum Magic-Link (siehe src/lib/passwort.ts)
  // — "salt:hash"-Format (scrypt), null = kein Passwort gesetzt, dann geht
  // nur Magic-Link. Bei Neuanlage vergibt der Admin ein Einmal-Passwort
  // (siehe vergebeEinmalPasswortFallsNoetig in admin/actions.ts).
  passwordHash: text("password_hash"),
  // true direkt nach Vergabe eines Einmal-Passworts — erzwingt auf
  // /profil/passwort-aendern die Vergabe eines eigenen Passworts, bevor der
  // Rest der App zugänglich ist (siehe requireSession in lib/session.ts).
  mussPasswortAendern: boolean("muss_passwort_aendern").notNull().default(false),
  // Opt-out für die drei automatischen Erinnerungs-Mails, die bisher
  // unconditional an jeden Funktionsträger bzw. Wart gingen (siehe
  // wochen-digest.ts, terminerinnerungen.ts, schiedsrichterwart-
  // erinnerung.ts) — einstellbar auf /profil. Default true: wer nichts
  // ändert, bekommt weiterhin genau das bisherige Verhalten.
  wochenDigestAktiviert: boolean("wochen_digest_aktiviert").notNull().default(true),
  terminErinnerungAktiviert: boolean("termin_erinnerung_aktiviert")
    .notNull()
    .default(true),
  offeneSchiedsrichterErinnerungAktiviert: boolean(
    "offene_schiedsrichter_erinnerung_aktiviert"
  )
    .notNull()
    .default(true),
  // Analog zu offeneSchiedsrichterErinnerungAktiviert oben, aber für die
  // Zeitnehmerwart-Rolle (siehe zeitnehmerwart-erinnerung.ts).
  offeneZeitnehmerErinnerungAktiviert: boolean(
    "offene_zeitnehmer_erinnerung_aktiviert"
  )
    .notNull()
    .default(true),
  // Persönlicher Kalender-Abo-Link (ICS-Feed, siehe lib/kalender-ics.ts) —
  // analog zu vereine.zeitnehmerSelbstanmeldungToken, aber pro Person statt
  // pro Verein. null = noch nicht aktiviert; Kenntnis des Tokens ist die
  // Berechtigung (login-freier Abruf durch Kalender-Apps).
  kalenderToken: text("kalender_token").unique(),
  // Zeitpunkt des letzten erfolgreichen Logins (Magic-Link oder Passwort) —
  // gesetzt im jwt-Callback in auth.ts, NUR bei frischem Login (nicht bei
  // jedem Request, siehe Kommentar dort). null = noch nie eingeloggt (z.B.
  // gerade erst als Funktionsträger angelegt). Für /admin/funktionstraeger,
  // damit Admins erkennen, welche Personen ihren Zugang noch nie genutzt
  // haben.
  letzterLoginAm: timestamp("letzter_login_am", { mode: "date" }),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ---------------------------------------------------------------------------
// Funktionsträger
// ---------------------------------------------------------------------------

export const funktionstraegerRollen = pgTable("funktionstraeger_rolle", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  typ: funktionstraegerTypEnum("typ").notNull(),
  // Nur bei typ = 'trainer' relevant
  mannschaftId: uuid("mannschaft_id").references(() => mannschaften.id, {
    onDelete: "set null",
  }),
  // Statt Löschen: wer den Verein verlässt, wird deaktiviert (bleibt aber in
  // der Historie von Zuordnungen erhalten). Inaktive Rollen tauchen nicht
  // mehr in Zuordnung/Selbst-Anmeldung auf.
  aktiv: boolean("aktiv").notNull().default(true),
});

export const schiedsrichterProfile = pgTable("schiedsrichter_profil", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lizenznummer: text("lizenznummer"),
  // Vom Schiedsrichter hinterlegte ICS-Abo-URL; Basis für periodischen Sync.
  icsFeedUrl: text("ics_feed_url"),
  letzterSyncAm: timestamp("letzter_sync_am", { mode: "date" }),
  letzterSyncStatus: syncStatusEnum("letzter_sync_status")
    .notNull()
    .default("noch_nie"),
});

// ---------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------

export const termine = pgTable("termin", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  typ: terminTypEnum("typ").notNull(),
  start: timestamp("start", { mode: "date" }).notNull(),
  ende: timestamp("ende", { mode: "date" }),
  ort: text("ort"),
  beschreibung: text("beschreibung"),
  quelle: terminQuelleEnum("quelle").notNull(),
  erstelltVon: text("erstellt_von").references(() => users.id, {
    onDelete: "set null",
  }),
  mannschaftId: uuid("mannschaft_id").references(() => mannschaften.id, {
    onDelete: "set null",
  }),
  // Für ICS-Feed-Termine: UID (+ ggf. RECURRENCE-ID) aus dem ICS-Standard,
  // um bei jedem Sync Änderungen sauber abzugleichen statt zu duplizieren.
  icsUid: text("ics_uid"),
  // set null statt cascade: wird die Person gelöscht, soll der Termin (das
  // Spiel) erhalten bleiben, nur ohne zugeordneten Schiedsrichter — analog
  // zu mannschaftId/erstelltVon oben (siehe auch deleteMannschaft-Kommentar
  // in admin/actions.ts, gleiches Prinzip).
  icsSchiedsrichterId: text("ics_schiedsrichter_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  // Nur bei typ = 'turnier_spiel' gesetzt: verweist auf den Turnier-
  // Container (typ = 'turnier'), zu dem dieses Einzelspiel gehört.
  turnierId: uuid("turnier_id").references((): AnyPgColumn => termine.id, {
    onDelete: "cascade",
  }),
  // Nur beim Turnier-Container (typ = 'turnier') gesetzt: zufälliger, nicht
  // erratbarer Token für die öffentliche, login-freie Lese-Ansicht
  // (/turnier/[token]) — Kenntnis des Links ist die Berechtigung.
  freigabeToken: text("freigabe_token").unique(),
  // Nur bei typ = 'rundenspiel' gesetzt: Roh-Namen aus dem nuLiga-Import,
  // unabhängig davon, ob eine der beiden Mannschaften erkannt wurde. Basis
  // dafür, dem Admin nachträglich "unbekannte Mannschaften" zum Anlegen
  // vorzuschlagen (siehe src/lib/rundenspiel-import.ts).
  heimMannschaftName: text("heim_mannschaft_name"),
  auswaertsMannschaftName: text("auswaerts_mannschaft_name"),
  // Nur bei typ = 'rundenspiel' gesetzt: Jugendklasse (z.B. "mJC") bzw.
  // Männer/Frauen ("Mä/männl.", "Fr/weibl.") aus dem nuLiga-Import — nötig,
  // um bei "Unbekannte Mannschaften" (rundenspiel-import.ts) gleichnamige
  // Vereine mit mehreren Mannschaften in unterschiedlichen Altersklassen/
  // Geschlechtern auseinanderzuhalten (nuLiga liefert nicht immer einen
  // unterscheidenden Nummern-Suffix wie "1"/"2").
  kategorie: text("kategorie"),
  // Nur bei typ = 'rundenspiel' gesetzt: true = echtes Ligaspiel (vom
  // Verband vergebene Spielnummer, siehe bildeUid in rundenspiel-import.ts),
  // false = Freundschaftsspiel/Turnier ohne feste Spielnummer, null = nicht
  // zutreffend (andere Termin-Typen). Eigene Spalte statt Text-Parsing aus
  // beschreibung, damit z.B. Typ-Badges in Kalenderansichten die korrekte
  // Bezeichnung zeigen können, statt widersprüchlich immer "Rundenspiel" zu
  // sagen, obwohl die Beschreibung "Freundschaftsspiel/Turnier" ausweist.
  pflichtspiel: boolean("pflichtspiel"),
  // Nur bei typ = 'rundenspiel' UND pflichtspiel = false gesetzt: ob es sich
  // laut Hallenplan konkret um ein Freundschaftsspiel oder ein Turnier
  // handelt (siehe freundschaftsTypEnum oben) — null lässt die Anzeige auf
  // den bisherigen, unspezifischen Fallback "Freundschaftsspiel/Turnier"
  // zurückfallen.
  freundschaftsTyp: freundschaftsTypEnum("freundschafts_typ"),
  // Nur beim Turnier-Container (typ = 'turnier') gesetzt: optionaler Trainer,
  // der für dieses eine Turnier zusätzlich zum Admin den Spielplan pflegen
  // und Ergebnisse eintragen darf (siehe requireTurnierZugriff in
  // admin/actions.ts) — bewusst kein pauschales Recht für alle Trainer,
  // sondern explizit pro Turnier vom Admin vergeben.
  turnierVerantwortlicherId: text("turnier_verantwortlicher_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  // Nur bei typ = 'turnier_spiel' gesetzt, beide zusammen oder keins —
  // getrennte Heim-/Auswärts-Spalten statt Freitext, damit z.B. eine
  // Tabellenberechnung später ohne Textparsing möglich wäre.
  ergebnisHeim: integer("ergebnis_heim"),
  ergebnisAuswaerts: integer("ergebnis_auswaerts"),
  // Nur bei typ = 'rundenspiel' ggf. gesetzt: von nuLiga selbst angesetzter
  // Schiedsrichter, als abgekürzter Nachname mit Punkt (z.B. "Geru.") — aus
  // der Zusatz-Zelle extrahiert (siehe rundenspiel-import.ts). Dient nur als
  // Abgleichs-Hinweis gegen die im Verein zugeordnete Person (siehe
  // schiedsrichterKuerzelPasstZu), nicht als automatische Zuordnung.
  nuligaSchiedsrichterKuerzel: text("nuliga_schiedsrichter_kuerzel"),
  // Nur bei typ = 'rundenspiel' ggf. gesetzt: von handball.net gemeldete
  // Besetzung (volle Namen statt Kürzel, siehe handball-net-scraper.ts) —
  // getrennt nach Schiedsrichter-Gespann und Zeitnehmer/Sekretär, da beide
  // Rollen unterschiedlichen Vereins-Zuordnungen entsprechen (schiedsrichter
  // vs. zeitnehmer/sekretaer, siehe terminZuordnungen). Wie
  // nuligaSchiedsrichterKuerzel nur ein Abgleichs-Hinweis (siehe
  // angesetzteNamenPassenZu in rundenspiel-import.ts), keine automatische
  // Zuordnung.
  handballNetSchiedsrichter: text("handball_net_schiedsrichter"),
  handballNetZeitnehmer: text("handball_net_zeitnehmer"),
  // Vom Zeitnehmerwart pro Einzeltermin gesetzter Bedarf, der den globalen
  // Bedarf aus den Vereinseinstellungen für GENAU diesen Termin übersteuert
  // (siehe bedarfFuer in lib/dienste.ts) — null = Standardverhalten (globale
  // Einstellung gilt), ein Wert (auch 0) übersteuert sie, z.B. wenn für ein
  // bestimmtes Spiel ausnahmsweise doch kein Zeitnehmer/Sekretär gebraucht
  // wird (oder mehr als sonst).
  zeitnehmerBedarfOverride: integer("zeitnehmer_bedarf_override"),
  // Zeitpunkt, zu dem der Ersteller (erstelltVon) zuletzt per Mail über ein
  // mögliches Duplikat dieses Termins informiert wurde (siehe
  // duplikat-benachrichtigung.ts) — null = noch nie gemeldet. Verhindert,
  // dass derselbe noch ungelöste Duplikat-Fund bei jedem täglichen Sync
  // erneut eine Mail auslöst.
  duplikatGemeldetAm: timestamp("duplikat_gemeldet_am", { mode: "date" }),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
});

export const terminZuordnungen = pgTable("termin_zuordnung", {
  id: uuid("id").primaryKey().defaultRandom(),
  terminId: uuid("termin_id")
    .notNull()
    .references(() => termine.id, { onDelete: "cascade" }),
  // Nullable: eine Zuordnung kann auch eine Person OHNE Zugang im System
  // sein (z.B. ein Schiedsrichter eines anderen Vereins, der nicht
  // eingeladen werden soll) — dann ist externerName gesetzt statt userId.
  // Diese Personen bekommen keine Benachrichtigungen, da es keine E-Mail
  // gibt, an die versendet werden könnte.
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  externerName: text("externer_name"),
  // Nur gesetzt, während externerName (noch) nicht vom Zeitnehmerwart
  // bestätigt wurde (siehe zeitnehmerVorschlagBestaetigen in
  // profil/zeitnehmerwart/actions.ts): bester automatischer Namens-Vorschlag
  // aus der öffentlichen Selbsteintragung (siehe findeNamensVorschlag in
  // lib/namens-abgleich.ts), zur Bestätigung/Korrektur durch den Wart. Kein
  // hartes Matching-Ergebnis, nur ein Vorschlag.
  matchVorschlagUserId: text("match_vorschlag_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  funktionstraegerTyp: funktionstraegerTypEnum("funktionstraeger_typ").notNull(),
  quelle: zuordnungQuelleEnum("quelle").notNull(),
});

export const icsSyncLog = pgTable("ics_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  schiedsrichterId: text("schiedsrichter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  synchronisiertAm: timestamp("synchronisiert_am", { mode: "date" })
    .notNull()
    .defaultNow(),
  neuCount: integer("neu_count").notNull().default(0),
  aktualisiertCount: integer("aktualisiert_count").notNull().default(0),
  entferntCount: integer("entfernt_count").notNull().default(0),
  status: syncStatusEnum("status").notNull(),
  fehlermeldung: text("fehlermeldung"),
});

export const benachrichtigungen = pgTable("benachrichtigung", {
  id: uuid("id").primaryKey().defaultRandom(),
  terminId: uuid("termin_id")
    .notNull()
    .references(() => termine.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  typ: text("typ").notNull(),
  versendetAm: timestamp("versendet_am", { mode: "date" }),
});

// Web-Push-Abos (siehe src/lib/push.ts). Ein Nutzer kann mehrere Geräte
// abonnieren (mehrere Zeilen); der Browser liefert je Gerät eine eigene
// endpoint-URL. Kein eigenes verein_id nötig — RLS läuft über den Join auf
// user (analog schiedsrichter_profil).
export const pushAbos = pgTable("push_abo", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
});
