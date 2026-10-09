-- Zeitnehmer und Sekretär sind EINE Funktion mit zwei Aufgaben (eine Verbandslizenz, in der Besetzung gemeinsam gezählt). Neu angelegte
-- Personen bekommen immer beide Rollen (siehe lib/funktionstraeger-rollen.ts); dieser einmalige Abgleich zieht den Bestand gerade:
-- wer nur eine der beiden Rollen hat, bekommt die andere dazu (gleicher Aktiv-Status, gleiche Lizenz). Idempotent: ohne Treffer passiert nichts,
-- eine zweite Ausführung ändert nichts. Rollen mit unterschiedlichem Aktiv-Status werden bewusst NICHT angefasst.
-- Läuft mit der privilegierten Rolle (BYPASSRLS), daher über alle Vereine.

-- 1. Zeitnehmer ohne Sekretär -> Sekretär ergänzen.
INSERT INTO "funktionstraeger_rolle" ("user_id", "typ", "aktiv", "lizenz_gueltig_bis", "lizenz_erinnerung_stufe")
SELECT r."user_id", 'sekretaer', r."aktiv", r."lizenz_gueltig_bis", r."lizenz_erinnerung_stufe"
FROM "funktionstraeger_rolle" r
WHERE r."typ" = 'zeitnehmer'
  AND NOT EXISTS (
    SELECT 1 FROM "funktionstraeger_rolle" x WHERE x."user_id" = r."user_id" AND x."typ" = 'sekretaer'
  );--> statement-breakpoint

-- 2. Sekretär ohne Zeitnehmer -> Zeitnehmer ergänzen.
INSERT INTO "funktionstraeger_rolle" ("user_id", "typ", "aktiv", "lizenz_gueltig_bis", "lizenz_erinnerung_stufe")
SELECT r."user_id", 'zeitnehmer', r."aktiv", r."lizenz_gueltig_bis", r."lizenz_erinnerung_stufe"
FROM "funktionstraeger_rolle" r
WHERE r."typ" = 'sekretaer'
  AND NOT EXISTS (
    SELECT 1 FROM "funktionstraeger_rolle" x WHERE x."user_id" = r."user_id" AND x."typ" = 'zeitnehmer'
  );--> statement-breakpoint

-- 3. Beide Rollen vorhanden, aber nur eine hat ein Lizenz-Datum -> auf die andere übertragen (nur wenn dort keines steht).
UPDATE "funktionstraeger_rolle" ziel
SET "lizenz_gueltig_bis" = quelle."lizenz_gueltig_bis",
    "lizenz_erinnerung_stufe" = quelle."lizenz_erinnerung_stufe"
FROM "funktionstraeger_rolle" quelle
WHERE ziel."user_id" = quelle."user_id"
  AND ziel."typ" IN ('zeitnehmer', 'sekretaer')
  AND quelle."typ" IN ('zeitnehmer', 'sekretaer')
  AND ziel."typ" <> quelle."typ"
  AND ziel."lizenz_gueltig_bis" IS NULL
  AND quelle."lizenz_gueltig_bis" IS NOT NULL;
