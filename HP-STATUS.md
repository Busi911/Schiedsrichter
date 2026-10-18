# HandballerPate – Projektstand (Automatisierter Entwicklungsassistent)

Stand: 2026-10-16

## Projekt

- **Name**: handballpate (HandballerPate / Schiedsrichter)
- **Repo**: github.com/Busi911/Schiedsrichter.git
- **Lokal**: /opt/data/schiedsrichter
- **Stack**: Next.js 16.4.0, React 19, Drizzle ORM, Neon Postgres (RLS multi-tenant), Auth.js (JWT), Vitest, PWA
- **Hosting**: Vercel (fra1), Produktion unter handballerpate.de
- **Branch**: main (Working Tree clean)
- **Letzter Commit**: 75a9b51 (fix: followup-cron verwendet isNotNull)
- **Dateien**: 545 TS/TSX, 109 Test-Dateien, 106 Migrationen
- **tsc**: 0 Fehler (clean)
- **Vitest**: 73 passed, 17 failed (DB-Integrationstests ohne DATABASE_URL), 19 skipped, 667 Tests grün
- **CLAUDE.md**: 86 KB, Stand 15. Okt. — Projektkonventionen, vor jedem Durchlauf lesen

## Entwicklungsbefugnisse

- Selbständige Umsetzung klar abgegrenzter Verbesserungen in isolierten Branches
- Vorhandene Tests ausführen (tsc --noEmit + vitest ohne DB-Tests)
- Draft-PR erstellen über GitHub API (gh CLI nicht installiert — Token aus Git-Remote)
- **Push nur auf Feature-Branches, niemals auf main** — nur main triggert Vercel-Deploy
- **Keine Merges, produktiven Deployments, DB-Migrationen, Secrets-Änderungen, Versandaktionen, Cron-Änderungen**
- **Produktions-DB nicht verwenden** — keine DATABASE_ADMIN_URL in lokaler Umgebung
- Vor Push prüfen: Feature-Branch-Push triggert keinen Vercel-Deploy (nur main)

## Vorhandene Hintergrundjobs

### Vercel-native Crons (vercel.json) — 17 Einträge

Siehe vercel.json im Repo. Wichtigste:
- liga-sync (stündlich 5–21 UTC), ndr-sync (4×/h 5–23 UTC), vereins-outreach (2× tägl. 10:30+16:30 UTC)
- followup-outreach (tägl. 10:45 UTC), nuliga-vereinsindex (So 03:20 UTC), wochen-digest (Mo 06:00 UTC)

### Hermes-Cron-Jobs (/opt/data/cron/jobs.json) — 7 Jobs

1. DeWe Consulting Wochenanalyse (Mo 08:00) — /opt/data/deweconsulting
2. BetreiberCockpit Fehler-Wächter (tägl. 07:00) — /opt/data/betreiber-cockpit
3. **Vereins-Outreach täglich** (tägl. 10:35 Berlin = 08:35 UTC) — ruft Vercel-Cron für HHV/HVBerlin/THV auf
   - **Zusätzlicher Outreach-Trigger**: Dieser Hermes-Job feuert um 10:35 Berlin (08:35 UTC). Die Vercel-Crons feuern um 10:30 UTC (12:30 Berlin) und 16:30 UTC (18:30 Berlin). Das ergibt 3 Outreach-Läufe/Tag. Funktionell nicht schädlich (jeder Lauf überspringt angeschriebene Vereine), aber die Outreach-Rate ist höher als im Skill dokumentiert. **Nicht ändern.**
4. BC Nutzungs-Insights (Mo 09:00) — /opt/data/betreiber-cockpit
5. BC Kandidaten-Outreach (tägl. 19:00) — /opt/data/betreiber-cockpit
6. TradingLab Strategie-Prüfung (So 20:00) — /opt/data/Jarvis
7. DeWe Projektassistent (Do 09:00) — /opt/data/deweconsulting

**Kein Hermes-Monitoring für**: liga-sync, NDR-sync, ICS-sync, Rundenspiel-Sync, Wochen-Digest — diese laufen nur über Vercel.

## Externe Zugänge

- **Git Remote**: Token in Remote-URL eingebettet — Push/Pull funktioniert
- **Neon MCP**: verbunden (active) — RUN_SQL verfügbar, aber nicht verwenden (Produktions-DB)
- **Vercel MCP**: verbunden (active) — Deploy-Logs abrufbar
- **GitHub CLI (gh)**: nicht installiert — PRs über GitHub API mit Token aus Remote-URL
- **Keine Zugangsdaten oder Tokens in Antworten ausgeben**

## Bekannte Einschränkungen

- `next build` lokal benötigt DATABASE_ADMIN_URL → nicht gesetzt → Build hängt. Stattdessen `npx tsc --noEmit` verwenden.
- 17 DB-Integrationstests fehlschlagen ohne DATABASE_URL → `npx vitest run` zeigt 73 passed / 17 failed. Nur non-DB Tests als Prüfung verwenden.
- 217 `claude/*` Remote-Branches — keine Überschneidung mit den 5 Aufgaben (geprüft).
- 0 offene PRs, 0 Draft-PRs (Stand 16. Okt.).

## Datei-Index

- `HP-STATUS.md` — Diese Datei. Zu Beginn jedes Durchlaufs laden.
- `HP-ARBEITSVORRAT.md` — Arbeitsvorrat mit 5 priorisierten Aufgaben. Zu Beginn jedes Durchlaufs laden.
- `CLAUDE.md` — Projektkonventionen (86 KB). Vor Code-Änderungen lesen.
- `.roadmap.md` — Roadmap mit Erledigt/Quick Wins/Technischen Verbesserungen.
- `docs/MOBILE_IMPROVEMENT_ROADMAP.md` — Mobile-Verbesserungs-Roadmap (Phase 0–7).
- `docs/MOBILE_APP_AUDIT.md` — Mobile-Audit (59 KB).
