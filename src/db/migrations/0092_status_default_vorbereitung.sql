-- DB-Default für vereine.status von "aktiv" auf "vorbereitung" ändern,
-- damit kein Verein versehentlich ohne Admin öffentlich wird.
-- Bestehende Vereine ohne Admin-User, die "aktiv" sind (entstanden durch den
-- vorherigen Default), auf "vorbereitung" zurücksetzen — sie haben keinen
-- Vereinsadmin und sollen nicht öffentlich sein oder Traffic erzeugen.

-- 1. Spalten-Default ändern.
ALTER TABLE "verein" ALTER COLUMN "status" SET DEFAULT 'vorbereitung';

-- 2. Vereine ohne Admin-User, die "aktiv" sind, auf "vorbereitung" zurücksetzen.
--    (Outreach-Kandidaten, die nie übergeben wurden, aber durch den alten
--    Default "aktiv" landeten.)
UPDATE "verein"
SET "status" = 'vorbereitung'
WHERE "status" = 'aktiv'
  AND "id" NOT IN (SELECT "verein_id" FROM "users" WHERE "ist_admin" = true);
