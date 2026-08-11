import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
]);

export const terminTypEnum = pgEnum("termin_typ", [
  "spiel_ics",
  "testspiel",
  "turnier",
]);

export const terminQuelleEnum = pgEnum("termin_quelle", [
  "ics_feed",
  "manuell",
]);

export const zuordnungQuelleEnum = pgEnum("zuordnung_quelle", [
  "zugeordnet_durch_admin",
  "selbst_angemeldet",
]);

export const zuschussStatusEnum = pgEnum("zuschuss_status", [
  "offen",
  "exportiert",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "noch_nie",
  "erfolgreich",
  "fehler",
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
  // Zuschüsse sind ein Opt-in: erst wenn der Admin sie aktiviert UND
  // mindestens eine Zuschussart gepflegt hat, taucht auf /admin/zuschuesse
  // überhaupt etwas auf.
  zuschuesseAktiviert: boolean("zuschuesse_aktiviert").notNull().default(false),
});

export const mannschaften = pgTable("mannschaft", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  altersklasse: text("altersklasse"),
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
  // Vereinsübergreifende Rolle (kein vereinId nötig): kann neue Vereine
  // anlegen, siehe /system/vereine. Löst den SETUP_SECRET-Bootstrap für den
  // Regelbetrieb ab (der bleibt als Notfall-Fallback bestehen).
  istSystemAdmin: boolean("ist_system_admin").notNull().default(false),
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
  icsSchiedsrichterId: text("ics_schiedsrichter_id").references(
    () => users.id,
    { onDelete: "cascade" }
  ),
  erstelltAm: timestamp("erstellt_am", { mode: "date" }).notNull().defaultNow(),
});

export const terminZuordnungen = pgTable("termin_zuordnung", {
  id: uuid("id").primaryKey().defaultRandom(),
  terminId: uuid("termin_id")
    .notNull()
    .references(() => termine.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  funktionstraegerTyp: funktionstraegerTypEnum("funktionstraeger_typ").notNull(),
  quelle: zuordnungQuelleEnum("quelle").notNull(),
});

// Einfache Zuschussberechnung pro geleitetem Spiel — bewusst schlank, da die
// eigentliche Abrechnung/Rechnungsstellung in einem externen System läuft.
// Vom Admin gepflegter Katalog möglicher Zuschüsse (z.B. "Schiedsrichter-
// Aufwandsentschädigung", 25,00 €), damit beim Anlegen eines Zuschusses kein
// freier Betrag getippt wird, sondern eine gepflegte Art gewählt wird.
export const zuschussarten = pgTable("zuschussart", {
  id: uuid("id").primaryKey().defaultRandom(),
  vereinId: uuid("verein_id")
    .notNull()
    .references(() => vereine.id, { onDelete: "cascade" }),
  bezeichnung: text("bezeichnung").notNull(),
  satz: numeric("satz", { precision: 10, scale: 2 }).notNull(),
});

export const zuschuesse = pgTable("zuschuss", {
  id: uuid("id").primaryKey().defaultRandom(),
  terminId: uuid("termin_id")
    .notNull()
    .references(() => termine.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  zuschussartId: uuid("zuschussart_id").references(() => zuschussarten.id, {
    onDelete: "set null",
  }),
  satz: numeric("satz", { precision: 10, scale: 2 }).notNull(),
  berechneterBetrag: numeric("berechneter_betrag", {
    precision: 10,
    scale: 2,
  }).notNull(),
  status: zuschussStatusEnum("status").notNull().default("offen"),
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
