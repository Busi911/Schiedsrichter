# Projekt-Notizen für Claude Code

Ergänzt `CLAUDE.md`/`AGENTS.md` um Betriebswissen, das sich nicht aus dem
Code allein erschließt.

## Deployment & Build

- `npm run build` führt vor `next build` immer `scripts/migrate-on-deploy.mjs`
  aus — DB-Migrationen laufen also automatisch bei jedem Deploy, nicht als
  separater Schritt.
- Vercel ist per natives Git-Integration angebunden (kein eigener Deploy-Step
  in `.github/workflows/`); `vercel.json` definiert u.a. ~20 Cron-Jobs
  (Liga-Sync, NDR-Sync, Zahlungserinnerungen, Vereins-Outreach u.a.).
- `.github/workflows/produkttour-screenshots.yml` ist bewusst nur manuell
  auslösbar (`workflow_dispatch`), da er einen echten Dev-Server + Postgres
  hochfährt — läuft nicht automatisch bei jedem Push.

## Tests

- `npm test` → Vitest.
- `npm run lint` → ESLint.

## Harness-Setup (ECC-Plugin)

- Baseline-Score bei Einrichtung (2026-10-21): 26/49 im `harness-audit`
  (Scope `repo`) — für den aktuellen Stand lieber neu laufen lassen
  (`node <ecc-plugin-root>/scripts/harness-audit.js repo --format text`)
  statt sich auf diese Zahl zu verlassen, sie wird nicht laufend gepflegt.
- Vercel-Workflow-Integration wurde bewusst NICHT ergänzt, da Vercel hier
  schon über die native Git-Integration deployt — ein zusätzlicher
  CLI-Schritt in `.github/workflows/` wäre redundant und bräuchte erst
  Secrets (`VERCEL_TOKEN` etc.).
- `evals/` wurde bewusst NICHT angelegt — der Check verlangt einen
  Top-Level-`tests/`-Ordner mit `*.test.js`, erkennt die tatsächliche,
  umfangreiche `src/**/*.test.ts`-Abdeckung dieses Projekts aber nicht.
- `.claude/hooks/guard-dangerous-bash.js` blockiert Force-Push/Delete auf
  main/master (Bash + PowerShell) als harten Fallback zum
  Git-Safety-Protokoll — löst den tatsächlichen aktuellen Branch per
  `git rev-parse` auf, matcht also auch `git push --force` ohne
  Branch-Angabe. Test: `node --test .claude/hooks/guard-dangerous-bash.test.js`.
