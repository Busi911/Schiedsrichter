import {
  type AnyPgColumn,
  customType,
  boolean,
  date,
  integer,
  jsonb,
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
  // Sammelt/verwaltet Eintrittsgeld o.ä. bei Testspielen/Turnieren/
  // Rundenspielen — organisatorisch wie Ordner/Kioskdienst behandelt (siehe
  // ORDNER_ROLLEN in lib/ordnerwart.ts): gleicher Bedarf-Mechanismus
  // (testspiel/turnier/rundenspielKassiererBedarf unten), gleiche
  // Selbsteintragung/Zuordnung über den Ordnerwart.
  "kassierer",
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

// Welche Ablauf-Erinnerungsstufe zu einer Lizenz (funktionstraeger_rolle.
// lizenz_gueltig_bis) zuletzt versendet wurde — siehe lizenz-erinnerung.ts.
// Reihenfolge der Werte entspricht der Dringlichkeit, gepflegt in
// LIZENZ_ERINNERUNG_STUFEN dort (Reihenfolge hier ohne fachliche Bedeutung,
// nur als DB-Enum-Deklaration).
export const lizenzErinnerungStufeEnum = pgEnum("lizenz_erinnerung_stufe", [
  "60_tage",
  "30_tage",
  "7_tage",
  "abgelaufen",
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

// Singleton (genau eine Zeile, siehe Migration) für vereinsübergreifende
// Systemkonfiguration, aktuell nur das Beta-Limit für die
// Selbstregistrierung (siehe /registrieren, vom Systemadmin einstellbar
// unter /system). Eigene Tabelle statt Env-Variable, weil der Systemadmin
// das zur Laufzeit ändern können soll, nicht nur beim Deploy.
export const systemEinstellungen = pgTable("system_einstellungen", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaVereinLimit: integer("beta_verein_limit").notNull().default(3),
});

// Anfragen, die eintreffen, nachdem das Beta-Limit (systemEinstellungen.
// betaVereinLimit) bereits ausgeschöpft ist (siehe vereinSelbstRegistrieren
// in app/registrieren/actions.ts) — Systemadmin sieht/bearbeitet sie unter
// /system/warteliste und kann von dort aus manuell freischalten (legt dann
// denselben Verein+Admin-Datensatz an wie eine reguläre Registrierung).
export const warteliste = pgTable("warteliste", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinsname: text("vereinsname").notNull(),
  adminName: text("admin_name").notNull(),
  adminEmail: text("admin_email").notNull(),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
});

export const vereine = pgTable("verein", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Strukturiert statt eines einzelnen Freitext-Felds (frühere Spalte
  // "adresse") — einfacher zu validieren/anzuzeigen als ein Textblock, in
  // dem Straße/PLZ/Ort nicht maschinenlesbar getrennt sind.
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
  // "vorbereitung": vom Systemadmin als Treuhänder eingerichtet, noch ohne
  // Vereinsadmin — nicht öffentlich sichtbar, es gehen keine Mails raus (siehe
  // lib/treuhand.ts). "aktiv": normaler Verein (Standard, auch für alle
  // bestehenden).
  status: text("status").$type<"vorbereitung" | "aktiv">().notNull().default("aktiv"),
  uebergebenAm: timestamp("uebergeben_am", { mode: "date" }),
  // Ausdrückliche Freigabe des Vereinsadmins, dass ein Systemadmin zu
  // Supportzwecken bis zu diesem Zeitpunkt in den Verein wechseln darf.
  // null = kein Zugriff.
  supportZugriffBis: timestamp("support_zugriff_bis", { mode: "date" }),
  // Zustimmung zum Auftragsverarbeitungsvertrag (Art. 28 DSGVO, siehe
  // /admin/avv) — erzwungen beim ersten Login des Vereinsadmins (siehe
  // erzwingeAvvZustimmungFallsNoetig in lib/session.ts). null = noch nicht
  // zugestimmt. avvAkzeptiertVersion hält fest, WELCHE Fassung akzeptiert
  // wurde (siehe AVV_VERSION in lib/avv.ts) — ändert sich der Text künftig
  // inhaltlich, muss erneut zugestimmt werden. Name/E-Mail des
  // zustimmenden Admins bewusst als Schnappschuss-Text statt FK auf user,
  // damit der Nachweis auch nach einem späteren Account-Wechsel erhalten
  // bleibt.
  avvAkzeptiertAm: timestamp("avv_akzeptiert_am", { mode: "date" }),
  avvAkzeptiertVersion: text("avv_akzeptiert_version"),
  avvAkzeptiertVonName: text("avv_akzeptiert_von_name"),
  avvAkzeptiertVonEmail: text("avv_akzeptiert_von_email"),
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
  // Kassierer-Bedarf, organisatorisch wie Ordner/Kioskdienst oben behandelt
  // (siehe ORDNER_ROLLEN in lib/ordnerwart.ts) — gleiche Termin-Typ-
  // Aufteilung, gleicher Default 0.
  testspielKassiererBedarf: integer("testspiel_kassierer_bedarf")
    .notNull()
    .default(0),
  turnierKassiererBedarf: integer("turnier_kassierer_bedarf")
    .notNull()
    .default(0),
  rundenspielKassiererBedarf: integer("rundenspiel_kassierer_bedarf")
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
  // Namen der eigenen Spielhallen (eine pro Zeile oder kommagetrennt): damit
  // lässt sich auch bei Quellen ohne nuLiga-Hallen-ID (handball.net) erkennen,
  // ob ein Spiel in einer eigenen Halle stattfindet. Teilstring-Vergleich.
  eigeneHallenNamen: text("eigene_hallen_namen"),
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
  // Opt-in für den Vereinsadmin: bei unbesetztem Ordner-/Kioskdienst-/
  // Kassierer-/Zeitnehmer-/Sekretär-Bedarf (3-Tage-Fenster wie in
  // dienste-erinnerung.ts) zusätzlich ALLE aktiven Inhaber der betroffenen
  // Rolle per Mail fragen, statt nur die Admins zu informieren (siehe
  // sendeOffeneDiensteBroadcast in lib/dienste-broadcast.ts). Default
  // false wie rundenspielAenderungenBenachrichtigungAktiviert oben — ein
  // zusätzlicher Mail-Kanal an die ganze Personengruppe ist kein
  // Verhalten, das jeder Verein automatisch will. Einzelne Personen
  // können zusätzlich für sich selbst abschalten, siehe
  // users.offeneDiensteBroadcastAktiviert.
  offeneDiensteBroadcastAktiviert: boolean("offene_dienste_broadcast_aktiviert")
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
  // Sichtbares Zeitfenster des Trainingsplan-Wochenrasters (siehe
  // TrainingsplanWoche) — als Minuten seit Mitternacht statt fester Stunden
  // gespeichert, konsistent mit trainingszeiten.startMinuten/endMinuten,
  // auch wenn die Einstellungsseite dafür nur volle Stunden anbietet. Ohne
  // diese Einstellung war das Grid bei jedem Verein fest 7-22 Uhr hoch,
  // unabhängig davon, wann tatsächlich trainiert wird. Default entspricht
  // dem bisherigen festen Verhalten.
  trainingsplanStartMinuten: integer("trainingsplan_start_minuten")
    .notNull()
    .default(7 * 60),
  trainingsplanEndMinuten: integer("trainingsplan_end_minuten")
    .notNull()
    .default(22 * 60),
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
  // grundsätzlich keinen Ordner-/Kioskdienst-/Kassierer-/Zeitnehmer-Bedarf
  // hat (z.B. eine Jugend-Mannschaft ohne eigene Heimspiele mit Publikum) —
  // siehe
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
  kassiererBedarfDeaktiviert: boolean("kassierer_bedarf_deaktiviert")
    .notNull()
    .default(false),
});

// Trainingshallen des Vereins (Stammdaten, siehe /admin/trainingsplan) — eine
// eigene Tabelle statt fester Slots wie bei nuligaHalle1Id/2Id/3Id oben, da
// es hier um beliebig viele, frei benannte Hallen für die Trainingsplanung
// geht, nicht um die (max. drei) Liga-Spielstätten für den nuLiga-Import.
export const hallen = pgTable("halle", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Optionale Unterteilung einer Halle in bis zu 4 gleichzeitig nutzbare
  // Abteile (z.B. per Hallentrenn-Vorhang) — 0 = keine Unterteilung. Feste
  // Slots statt einer eigenen Kind-Tabelle, analog zu nuligaHalle1Id/2Id/3Id
  // oben: die Obergrenze ist klein und fest (siehe TrainingszeitDialog), ein
  // eigenes Tabellen-/FK-Geflecht wäre hier unverhältnismäßig. Jedes Abteil
  // ist optional benennbar (abteilNName), sonst zeigt die UI "Abteil N" als
  // Fallback. trainingszeiten.abteilNummer referenziert die Nummer (1-4),
  // nicht diese Namensspalten direkt.
  abteilAnzahl: integer("abteil_anzahl").notNull().default(0),
  abteil1Name: text("abteil_1_name"),
  abteil2Name: text("abteil_2_name"),
  abteil3Name: text("abteil_3_name"),
  abteil4Name: text("abteil_4_name"),
  erstelltAm: timestamp("erstellt_am").notNull().defaultNow(),
});

// Ein wiederkehrender wöchentlicher Trainingstermin einer Mannschaft in
// einer Halle (siehe /admin/trainingsplan) — bewusst OHNE konkretes Datum,
// da rein die wöchentliche Wiederholung geplant wird (kein Kalenderjahr,
// keine Ferien-/Feiertags-Ausnahmen). Eine Mannschaft kann beliebig viele
// Einträge in unterschiedlichen Hallen haben (z.B. montags Halle A,
// mittwochs Halle B) — hier bewusst KEINE feste Mannschaft-Halle-Zuordnung.
// startMinuten/endMinuten sind Minuten seit Mitternacht (0-1439 bzw.
// 15-1440), beide Vielfache von 15 (Raster siehe TrainingsplanGrid) — als
// Minuten statt time-Spalte, da die Grid-Berechnung (Pixel <-> Zeit) ohnehin
// in Minuten rechnet und so ohne Zeitzone-/Datums-Fallstricke auskommt.
export const trainingszeiten = pgTable("trainingszeit", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  mannschaftId: uuid("mannschaft_id")
    .notNull()
    .references(() => mannschaften.id, { onDelete: "cascade" }),
  halleId: uuid("halle_id")
    .notNull()
    .references(() => hallen.id, { onDelete: "cascade" }),
  // 0 = Montag … 6 = Sonntag, gleiche Konvention wie monatsGitter in
  // lib/kalender.ts.
  wochentag: integer("wochentag").notNull(),
  startMinuten: integer("start_minuten").notNull(),
  endMinuten: integer("end_minuten").notNull(),
  // Freie Hex-Farbe statt Enum — feste Auswahl-Palette lebt bewusst nur im
  // UI (TrainingsplanGrid), damit sie sich ohne Migration erweitern lässt.
  farbe: text("farbe").notNull().default("#3b82f6"),
  // Welches Abteil der Halle (1-4, siehe hallen.abteilAnzahl) dieses
  // Training belegt — null, wenn die Halle nicht unterteilt ist oder das
  // Abteil (noch) nicht zugewiesen wurde. Rein informativ (Anzeige-Label im
  // Grid/Agenda), erzwingt keine Positions-/Konflikt-Logik: mehrere
  // gleichzeitige Trainings derselben Halle werden unabhängig davon schon
  // heute nebeneinander statt als Konflikt dargestellt (siehe
  // platziereZeitbloecke).
  abteilNummer: integer("abteil_nummer"),
  erstelltAm: timestamp("erstellt_am").notNull().defaultNow(),
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
// Treuhand: Systemadmin richtet einen Verein ein / bekommt Support-Zugriff
// ---------------------------------------------------------------------------
// Beide Tabellen sind bewusst systemweit (kein RLS, app_user hat keinen
// Zugriff, siehe Migration): nur über adminDb aus lib/treuhand.ts.

// Aktiver Vereinskontext eines Systemadmins (höchstens einer je Systemadmin).
// Gelöscht bei "Zurück ins System", Übergabe oder Widerruf/Ablauf der Freigabe.
export const treuhandZugriffe = pgTable("treuhand_zugriff", {
  id: uuid("id").primaryKey().defaultRandom(),
  systemAdminUserId: text("system_admin_user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  art: text("art").$type<"einrichtung" | "support">().notNull(),
  gestartetAm: timestamp("gestartet_am", { mode: "date" }).notNull().defaultNow(),
});

// Nachweis, wer wann in einem Verein tätig war und wann übergeben wurde.
export const vereinProtokoll = pgTable("verein_protokoll", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  aktion: text("aktion").notNull(),
  // Schnappschuss statt FK, damit der Eintrag auch nach Kontolöschung bleibt.
  akteur: text("akteur"),
  details: text("details"),
  zeitpunkt: timestamp("zeitpunkt", { mode: "date" }).notNull().defaultNow(),
});

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
  // Selbstverwaltung durch die Person selbst (siehe /profil).
  telefonnummer: text("telefonnummer"),
  // Selbst angestoßene E-Mail-Änderung (siehe emailAendernAnfordern in
  // profil/actions.ts): neue Adresse wird erst nach Bestätigung über einen
  // Link an genau diese Adresse in `email` übernommen (login-kritisch,
  // daher Bestätigung statt sofortiger Änderung wie beim Admin-Pendant
  // updateFunktionstraeger). null = keine Änderung ausstehend.
  pendingEmail: text("pending_email"),
  pendingEmailToken: text("pending_email_token").unique(),
  pendingEmailTokenAblaufAm: timestamp("pending_email_token_ablauf_am", {
    mode: "date",
  }),
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
  // Persönliches Opt-out für den Rollen-Broadcast bei unbesetztem Dienst
  // (siehe vereine.offeneDiensteBroadcastAktiviert oben, das den Kanal erst
  // pro Verein aktivieren muss) — Default true, damit der Vereins-Schalter
  // ohne weiteres Zutun tatsächlich alle Rolleninhaber erreicht; wer die
  // Mail nicht will, schaltet sie individuell auf /profil ab.
  offeneDiensteBroadcastAktiviert: boolean("offene_dienste_broadcast_aktiviert")
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
  // Ablaufdatum der Verbands-Lizenz — nur bei typ 'schiedsrichter',
  // 'zeitnehmer' oder 'sekretaer' fachlich sinnvoll (siehe
  // LIZENZ_ROLLEN in lizenz-erinnerung.ts), UI blendet das Feld sonst aus.
  // null = keine Lizenz hinterlegt (kein Ablauf-Tracking für diese Rolle).
  lizenzGueltigBis: timestamp("lizenz_gueltig_bis", { mode: "date" }),
  // Höchste bereits versendete Erinnerungsstufe für lizenzGueltigBis (siehe
  // lizenz-erinnerung.ts) — verhindert tägliches Doppelversenden innerhalb
  // desselben Fensters. Wird beim Setzen/Ändern von lizenzGueltigBis wieder
  // auf null zurückgesetzt (neue/verlängerte Lizenz, siehe
  // updateFunktionstraegerLizenz in admin/actions.ts).
  lizenzErinnerungStufe: lizenzErinnerungStufeEnum("lizenz_erinnerung_stufe"),
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
  // Gesetzt, wenn die zugeordnete Person sich selbst wieder abmelden möchte
  // (siehe selbstAbmelden in profil/actions.ts) — entfernt die Zuordnung
  // NICHT sofort, sondern markiert sie nur als Anfrage: der zuständige Wart
  // muss sie erst bestätigen (siehe abmeldungGenehmigen/abmeldungAblehnen in
  // profil/ordnerwart/actions.ts bzw. profil/zeitnehmerwart/actions.ts),
  // damit ein Abmelden nicht stillschweigend passiert, ohne dass der Wart
  // die Lücke bemerkt.
  abmeldungAngefragtAm: timestamp("abmeldung_angefragt_am", { mode: "date" }),
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

// Freitext-Feedback aus dem Header (siehe FeedbackDialog) — Vereine testen
// die App gerade aktiv, daher ein niedrigschwelliger Kanal direkt aus jeder
// eingeloggten Seite statt eines externen Formulars. Wird vom Systemadmin
// vereinsübergreifend eingesehen (siehe /system/feedback), daher trotz
// eigenem vereinId regulär tenant-isoliert wie mannschaft (Schreiben läuft
// über withTenant, Lesen für /system/feedback über adminDb).
export const produktFeedback = pgTable("produkt_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  seite: text("seite").notNull(),
  nachricht: text("nachricht").notNull(),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
});


// ---------------------------------------------------------------------------
// Öffentliche Vereins-/Mannschaftsseiten (/verein/[slug], siehe src/lib/nuliga)
// ---------------------------------------------------------------------------
//
// Alle liga_*-Tabellen sind — wie system_einstellungen/warteliste — bewusst
// OHNE verein_id/RLS: sie enthalten ausschließlich öffentliche Sportdaten
// (Mannschaften, Tabellen, Spiele) und werden anonym gelesen. Geschrieben
// wird nur über adminDb (Sync, siehe lib/nuliga/sync). Die einzige Brücke
// zum Mandanten ist liga_verein.verein_id (nur registrierte Vereine haben
// eine öffentliche Seite). Personenbezogene nuLiga-Angaben
// (Mannschaftsverantwortliche, Schiedsrichter) haben hier bewusst keine
// Spalte.

export const ligaSyncStatusEnum = pgEnum("liga_sync_status", [
  "erfolgreich",
  "teilweise",
  "fehler",
]);

export const ligaSpielStatusEnum = pgEnum("liga_spiel_status", [
  "geplant",
  "verlegt",
  "abgesagt",
  "nicht_angetreten",
  "gespielt",
]);

export const ligaKategorieEnum = pgEnum("liga_kategorie", [
  "herren",
  "damen",
  "jugend_maennlich",
  "jugend_weiblich",
  "kinder",
  "sonstige",
]);

export const ligaVereine = pgTable(
  "liga_verein",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Der registrierte Verein (Mandant), zu dem diese öffentliche Seite
    // gehört — Löschen des Vereins entfernt auch die öffentliche Seite.
    vereinId: uuid("verein_id")
      .notNull()
      .unique()
      .references(() => vereine.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    // Name laut nuLiga (kann vom Vereinsnamen in der App abweichen).
    name: text("name").notNull(),
    // Landesverband (Schlüssel in lib/nuliga/verbaende.ts) — vorbereitet für
    // mehrere nuLiga-Instanzen.
    verband: text("verband").notNull().default("HHV"),
    // Quellen: ein Verein hat nuLiga (Landesverband) und/oder handball.net
    // (DHB-Wettbewerbe). Mindestens eine ist gesetzt.
    nuligaClubId: text("nuliga_club_id"),
    handballNetClubId: text("handball_net_club_id"),
    // Optional manuell hinterlegte handball.net-Team-IDs (kommagetrennt),
    // falls die Teamliste des Vereins nicht automatisch ermittelt werden kann.
    handballNetTeamIds: text("handball_net_team_ids"),
    handballNetSynchronisiertAm: timestamp("handball_net_synchronisiert_am", { mode: "date" }),
    strukturSynchronisiertAm: timestamp("struktur_synchronisiert_am", { mode: "date" }),
    spieleSynchronisiertAm: timestamp("spiele_synchronisiert_am", { mode: "date" }),
    syncStatus: ligaSyncStatusEnum("sync_status"),
    erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("liga_verein_verband_club_idx").on(t.verband, t.nuligaClubId),
    uniqueIndex("liga_verein_handball_net_club_idx").on(t.handballNetClubId),
  ]
);

// Zusätzliche nuLiga-Vereine, aus denen NUR ausgewählte Mannschaften auf die
// öffentliche Seite übernommen werden — z.B. eine Spielgemeinschaft, die in
// nuLiga unter dem führenden Partnerverein geführt wird. Gefiltert wird über
// die Kategorie (liga_kategorie, kommagetrennt) und optional einen Textteil
// des Mannschafts-/Liganamens; der Rest des Partnervereins wird nie übernommen.
// Wie die übrigen liga_*-Tabellen ohne RLS (nur öffentliche Sportdaten).
export const ligaVereinZusatzquellen = pgTable(
  "liga_verein_zusatzquelle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ligaVereinId: uuid("liga_verein_id")
      .notNull()
      .references(() => ligaVereine.id, { onDelete: "cascade" }),
    nuligaClubId: text("nuliga_club_id").notNull(),
    // Freies Label für die Anzeige in den Einstellungen (z.B. "KSG Bieber").
    bezeichnung: text("bezeichnung"),
    // Kommagetrennte liga_kategorie-Werte, leer = alle Kategorien.
    kategorien: text("kategorien").notNull().default(""),
    // Optionaler Textteil (ohne Groß-/Kleinschreibung), der im Mannschafts-
    // oder Liganamen vorkommen muss.
    nameEnthaelt: text("name_enthaelt"),
    erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("liga_zusatzquelle_verein_club_idx").on(t.ligaVereinId, t.nuligaClubId)]
);

// Eine nuLiga-Spielgruppe (Liga/Staffel) einer Saison — zentrale Einheit:
// Tabelle und Spiele hängen an der Gruppe, nicht an einer Mannschaft.
export const ligaGruppen = pgTable(
  "liga_gruppe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verband: text("verband").notNull().default("HHV"),
    // Datenquelle der Gruppe: "nuliga" | "handball_net". Die Spalten
    // nuliga_group_id/nuliga_teamtable_id/halle_nuliga_id tragen je nach Quelle
    // die externe ID (handball.net: Phasen-/Team-/Hallen-ID, verband = "DHB").
    quelle: text("quelle").notNull().default("nuliga"),
    nuligaGroupId: text("nuliga_group_id").notNull(),
    championship: text("championship").notNull(),
    saison: text("saison"),
    ligaName: text("liga_name").notNull(),
    geschlecht: text("geschlecht"),
    altersklasse: text("altersklasse"),
    spielklasse: text("spielklasse"),
    gruppe: text("gruppe"),
    istMeldeliste: boolean("ist_meldeliste").notNull().default(false),
    tabelleSynchronisiertAm: timestamp("tabelle_synchronisiert_am", { mode: "date" }),
  },
  (t) => [uniqueIndex("liga_gruppe_verband_gruppe_idx").on(t.verband, t.nuligaGroupId)]
);

// Alle Teams einer Gruppe samt Tabellenstand (auch Gegner anderer Vereine —
// nötig für die Tabelle und zur Auflösung von Heim/Gast).
export const ligaTabellenzeilen = pgTable(
  "liga_tabellenzeile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gruppeId: uuid("gruppe_id")
      .notNull()
      .references(() => ligaGruppen.id, { onDelete: "cascade" }),
    nuligaTeamtableId: text("nuliga_teamtable_id").notNull(),
    name: text("name").notNull(),
    rang: integer("rang").notNull(),
    spiele: integer("spiele"),
    siege: integer("siege"),
    unentschieden: integer("unentschieden"),
    niederlagen: integer("niederlagen"),
    torePlus: integer("tore_plus"),
    toreMinus: integer("tore_minus"),
    punktePlus: integer("punkte_plus"),
    punkteMinus: integer("punkte_minus"),
    zurueckgezogen: boolean("zurueckgezogen").notNull().default(false),
  },
  (t) => [uniqueIndex("liga_tabellenzeile_gruppe_team_idx").on(t.gruppeId, t.nuligaTeamtableId)]
);

// Stabile Identität einer Mannschaft über Saisons hinweg (Schlüssel aus der
// Normalisierung, siehe lib/nuliga/normalisierung.ts) — NICHT der
// angezeigte Name und keine nuLiga-ID.
export const ligaMannschaften = pgTable(
  "liga_mannschaft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ligaVereinId: uuid("liga_verein_id")
      .notNull()
      .references(() => ligaVereine.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    schluessel: text("schluessel").notNull(),
    name: text("name").notNull(),
    // Vom Verein vergebener Anzeigename (Admin → Öffentliche Vereinsseite);
    // überschreibt name auf den öffentlichen Seiten und bleibt bei jedem
    // Sync erhalten. null = Name aus der Quelle.
    anzeigenameEigen: text("anzeigename_eigen"),
    kategorie: ligaKategorieEnum("kategorie").notNull(),
    geschlecht: text("geschlecht"),
    altersklasse: text("altersklasse"),
    untergruppe: text("untergruppe"),
    nummer: integer("nummer").notNull().default(1),
    aktiv: boolean("aktiv").notNull().default(true),
  },
  (t) => [
    uniqueIndex("liga_mannschaft_verein_slug_idx").on(t.ligaVereinId, t.slug),
    uniqueIndex("liga_mannschaft_verein_schluessel_idx").on(t.ligaVereinId, t.schluessel),
  ]
);

// Die Mannschaft in einer Gruppe einer Saison. teamtable-ID ist erst nach
// dem Abgleich mit der Gruppentabelle bekannt (clubTeams liefert nur die
// Gruppe).
export const ligaTeilnahmen = pgTable(
  "liga_teilnahme",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mannschaftId: uuid("mannschaft_id")
      .notNull()
      .references(() => ligaMannschaften.id, { onDelete: "cascade" }),
    gruppeId: uuid("gruppe_id")
      .notNull()
      .references(() => ligaGruppen.id, { onDelete: "cascade" }),
    saison: text("saison").notNull(),
    nuligaTeamtableId: text("nuliga_teamtable_id"),
    // Roh-Name laut clubTeams (z.B. "männliche Jugend D II") für Diagnose.
    nuligaName: text("nuliga_name").notNull(),
    // Stand laut clubTeams, falls die Tabellenzeile nicht zugeordnet werden
    // konnte — die Mannschaft bleibt dann trotzdem mit Rang/Punkten sichtbar.
    rang: integer("rang"),
    punktePlus: integer("punkte_plus"),
    punkteMinus: integer("punkte_minus"),
    aktiv: boolean("aktiv").notNull().default(true),
    synchronisiertAm: timestamp("synchronisiert_am", { mode: "date" }).notNull().defaultNow(),
    // Wann zuletzt der Spielplan dieser Mannschaft geladen wurde — macht den
    // Spiele-Sync fortsetzbar (Zeitlimit) und fair (ältester zuerst).
    spieleSynchronisiertAm: timestamp("spiele_synchronisiert_am", { mode: "date" }),
  },
  (t) => [uniqueIndex("liga_teilnahme_mannschaft_gruppe_idx").on(t.mannschaftId, t.gruppeId)]
);

export const ligaSpiele = pgTable(
  "liga_spiel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gruppeId: uuid("gruppe_id")
      .notNull()
      .references(() => ligaGruppen.id, { onDelete: "cascade" }),
    // nuLiga: Spielnummer in der Gruppe. handball.net: null, dort gilt spielcode.
    spielnummer: integer("spielnummer"),
    // Offizielle Spielnummer des DHB (z.B. "2627DHB3LERMC0701"), je Gruppe eindeutig.
    spielcode: text("spielcode"),
    quelle: text("quelle").notNull().default("nuliga"),
    externeId: text("externe_id"),
    meetingId: text("meeting_id"),
    datum: date("datum", { mode: "string" }).notNull(),
    uhrzeit: text("uhrzeit"),
    beginn: timestamp("beginn", { mode: "date", withTimezone: true }),
    urspruenglicherBeginn: timestamp("urspruenglicher_beginn", {
      mode: "date",
      withTimezone: true,
    }),
    halleName: text("halle_name"),
    halleNummer: text("halle_nummer"),
    halleNuligaId: text("halle_nuliga_id"),
    heimName: text("heim_name").notNull(),
    gastName: text("gast_name").notNull(),
    heimTeamtableId: text("heim_teamtable_id"),
    gastTeamtableId: text("gast_teamtable_id"),
    toreHeim: integer("tore_heim"),
    toreGast: integer("tore_gast"),
    halbzeitHeim: integer("halbzeit_heim"),
    halbzeitGast: integer("halbzeit_gast"),
    ergebnisBestaetigt: boolean("ergebnis_bestaetigt").notNull().default(false),
    status: ligaSpielStatusEnum("status").notNull().default("geplant"),
    synchronisiertAm: timestamp("synchronisiert_am", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("liga_spiel_gruppe_nummer_idx").on(t.gruppeId, t.spielnummer),
    uniqueIndex("liga_spiel_gruppe_code_idx").on(t.gruppeId, t.spielcode),
  ]
);

// Protokoll jedes Sync-Laufs (Fehler nachvollziehbar, siehe lib/nuliga/sync).
export const ligaSyncLaeufe = pgTable("liga_sync_lauf", {
  id: uuid("id").primaryKey().defaultRandom(),
  ligaVereinId: uuid("liga_verein_id")
    .notNull()
    .references(() => ligaVereine.id, { onDelete: "cascade" }),
  art: text("art").notNull(), // "struktur" | "spiele"
  gestartetAm: timestamp("gestartet_am", { mode: "date" }).notNull().defaultNow(),
  dauerMs: integer("dauer_ms"),
  anfragen: integer("anfragen").notNull().default(0),
  neu: integer("neu").notNull().default(0),
  aktualisiert: integer("aktualisiert").notNull().default(0),
  status: ligaSyncStatusEnum("status").notNull(),
  meldungen: jsonb("meldungen").$type<string[]>().notNull().default([]),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// Vereinslogo für die öffentliche Seite/Web-App: bereits normalisiert (PNG,
// 512x512, siehe lib/liga-logo.ts) und deshalb klein. Eigene Tabelle, damit
// Abfragen auf liga_verein nie das Bild mitladen.
export const ligaVereinLogos = pgTable("liga_verein_logo", {
  ligaVereinId: uuid("liga_verein_id")
    .primaryKey()
    .references(() => ligaVereine.id, { onDelete: "cascade" }),
  png: bytea("png").notNull(),
  // Hauptfarbe des Logos als Farbton (0-359), beim Upload ermittelt (siehe
  // ermittleFarbton in lib/liga-logo.ts) — null bei farblosen Logos
  // (schwarz/weiß/grau), dann gilt die aus dem Slug abgeleitete Farbe.
  farbton: integer("farbton"),
  aktualisiertAm: timestamp("aktualisiert_am", { mode: "date" }).notNull().defaultNow(),
});
