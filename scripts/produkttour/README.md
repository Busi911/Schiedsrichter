# Produkttour-Screenshots neu erzeugen

Die Startseite (`src/app/page.tsx`, `PRODUKTTOUR`) zeigt fünf Screenshots
der echten App mit Beispieldaten (`public/produkttour/*.png`). So werden
sie reproduziert, wenn sich an den gezeigten Seiten sichtbar etwas
ändert:

- **Automatisch (empfohlen):** GitHub Actions → "Produkttour-Screenshots
  neu erzeugen" → "Run workflow". Lädt die neuen PNGs am Ende als
  Workflow-Artifact hoch (`public/produkttour`) — danach lokal
  herunterladen, in `public/produkttour/` ersetzen und normal committen.
  Der Workflow committet/pusht nichts von sich aus.
- **Lokal**, gegen eine **wegwerfbare** lokale Postgres-Instanz (niemals
  gegen die echte/produktive Datenbank — der erzeugte Demo-Verein würde
  sonst live gegen das Beta-Vereinslimit zählen):

  ```bash
  # 1. Lokale Postgres-DB + Schema (siehe README.md#lokales-setup)
  createdb handballpate
  npx drizzle-kit migrate
  psql "$DATABASE_ADMIN_URL" -c "ALTER ROLE app_user WITH PASSWORD 'lokal';"
  psql "$DATABASE_ADMIN_URL" -c "INSERT INTO system_einstellungen (beta_verein_limit) VALUES (50);"
  # DATABASE_URL in .env danach auf die app_user-Rolle umstellen

  # 2. @neondatabase/serverless spricht nur mit einem echten Neon-Endpunkt —
  #    für eine normale lokale Postgres-Instanz stattdessen kurzzeitig auf
  #    den node-postgres-Treiber umschalten (VOR dem Seed-Skript, das
  #    denselben src/db-Code importiert):
  git apply scripts/produkttour/local-pg-driver.patch

  # 3. Demo-Verein + Beispieldaten
  npm run produkttour:seed

  # 4. Dev-Server + Screenshots
  npm run dev &
  npm run produkttour:screenshot

  # 5. WICHTIG: den Treiber-Patch wieder verwerfen, sonst läuft die App
  #    lokal weiter mit node-postgres statt Neon — nie mit committen.
  git checkout -- src/db/index.ts src/db/admin.ts
  ```

`seed.ts` legt einen Verein "TSV Musterstadt Handball" mit Admin,
Funktionsträgern, Mannschaften, Hallen, Trainingszeiten und Terminen an
(Login: `admin@demo.handballerpate.de` / `Demo-Passwort-1!`).
`screenshot.mjs` loggt sich damit ein, fährt fünf Admin-Seiten an und
schneidet die Screenshots auf den relevanten Ausschnitt zu (Crop-Werte in
`screenshot.mjs` ggf. nachjustieren, falls sich die Kartenhöhen ändern).
