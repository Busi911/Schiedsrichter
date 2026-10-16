# HandballerPate – Arbeitsvorrat (Automatisierter Entwicklungsassistent)

Stand: 2026-10-16

## Regeln für jeden Durchlauf

1. **Laden**: `HP-STATUS.md` und `HP-ARBEITSVORRAT.md` zuerst lesen.
2. **Prüfen**: `git fetch origin && git branch -r` — offene PRs per GitHub API prüfen.
3. **Höchstens eine Aufgabe pro Durchlauf** — die mit höchster Priorität, die noch nicht erledigt und nicht blockiert ist.
4. **Eigener PR wartet?** Wenn ein Draft-PR von diesem Assistenten auf Prüfung wartet: keine weitere Implementierung beginnen, stattdessen Status berichten.
5. **Branch**: Jede Aufgabe in einem isolierten Branch `hp/aufgabe-<slug>`. Nie auf main pushen.
6. **Push**: Nur Feature-Branch pushen (triggert keinen Vercel-Deploy — nur main tut das).
7. **Prüfung**: `npx tsc --noEmit` (muß 0 Fehler) + `npx vitest run` (non-DB-Tests müssen grün).
8. **Draft-PR**: Über GitHub API mit Token aus Remote-URL erstellen.
9. **Keine Merges, keine produktiven Deployments, keine DB-Migrationen, keine Secrets-Änderungen, keine Versandaktionen, keine Cron-Änderungen.**
10. **Fertig-Kriterium**: Die Aufgabe ist erledigt, wenn der Draft-PR erstellt ist UND tsc+vitest grün sind.
11. **Blockiert?** Wenn eine Aufgabe blockiert ist (z.B. produtives Schreiben nötig, Deployment erforderlich): als blockiert markieren, das Hindernis beschreiben, nächste Aufgabe versuchen.
12. **Alles erledigt/blockiert?** Kurz berichten und beenden. Keine neuen Aufgaben erfinden.

---

## Aufgabe 1: Sponsor-Splash Barrierefreiheit (a11y)

**Priorität**: Barrierefreiheit (P1)
**Status**: erledigt (PR #409 gemergt, Commit 69928ec)
**Branch**: hp/aufgabe-sponsor-splash-a11y
**PR**: #409
**Aufwand**: S (≤ 1 Tag)

### Problem
`src/components/liga/sponsor-splash.tsx` (96 Zeilen) zeigt ein Sponsorenbild beim Öffnen der Vereinsseite. Der Dialog hat:
- Kein `aria-modal="true"` — Screenreader erkennen den Modal nicht
- Keinen `role="dialog"` — keine semantische Rolle
- Fokus wird nicht auf den Schließen-Button gesetzt
- Fokus wird beim Schließen nicht zurückgeführt
- Der Schließen-Button ist nicht als solcher beschriftet (`aria-label` fehlt oder unzureichend)

### Lösung
- `role="dialog"` + `aria-modal="true"` am Container
- `aria-label="Sponsor"` oder beschreibendes Label
- Fokus auf Schließen-Button beim Öffnen (`useRef` + `focus()`)
- Fokus zurück beim Schließen (vorheriges aktives Element merken)
- Schließen-Button ≥ 44 px Tippfläche (`min-h-11 min-w-11`)
- Escape funktioniert bereits (vorhanden) — beibehalten

### Fertig-Kriterium
- `sponsor-splash.tsx` hat `role="dialog"`, `aria-modal="true"`, Fokus-Management
- `npx tsc --noEmit` → 0 Fehler
- `npx vitest run` → non-DB-Tests grün (73+ passed)
- Draft-PR erstellt mit Beschreibung der a11y-Verbesserungen

---

## Aufgabe 2: Footer entdynamisieren (auth() aus Footer lösen)

**Priorität**: Performance (P1)
**Status**: offen
**Branch**: —
**Aufwand**: S (≤ 1 Tag)

### Problem
`src/components/footer.tsx` (53 Zeilen) ist `async` und ruft `auth()` auf — das macht den gesamten Footer zu einer dynamischen Server-Komponente. Das verhindert, dass öffentliche Seiten (`/app-hilfe`, `/impressum`, `/datenschutz`, `/verein/[slug]`) statisch generiert werden können, weil `auth()` eine Session-Datenbankabfrage macht.

### Lösung
- `auth()` aus dem Footer herauslösen
- Client-Komponente `FooterLink` (klein) für den "Verein registrieren"-Link — liest Session-Status über `useSession()` oder einen passenden Client-Hook
- Footer selbst wird zu einer statischen Server-Komponente ohne `async`
- Der "Verein registrieren"-Link wird clientseitig ausgeblendet, wenn eingeloggt
- `next build` zeigt `/app-hilfe`, `/impressum`, `/datenschutz` als statisch (ohne lokal zu bauen: tsc prüfen)

### Fertig-Kriterium
- `footer.tsx` ist nicht mehr `async` und ruft `auth()` nicht direkt auf
- Ein kleiner Client-Teil übernimmt den "Verein registrieren"-Link
- `npx tsc --noEmit` → 0 Fehler
- `npx vitest run` → non-DB-Tests grün
- Draft-PR erstellt

### Hinweis
- Remote-Branch `origin/claude/footer-fan` existiert (1 Commit: "Fußzeile nicht mehr von der Bottom-Bar verdeckt") — prüfen, ob er überschneidet. Falls ja, darauf aufbauen oder getrennt lösen.
- `next build` lokal hängt ohne `DATABASE_ADMIN_URL` — nur `tsc --noEmit` als Prüfung verwenden.

---

## Aufgabe 3: Service Worker — Netz-Timeout und Offline-Fallback

**Priorität**: Performance / Offline-Verfügbarkeit (P1)
**Status**: offen
**Branch**: —
**Aufwand**: S (≤ 1 Tag)

### Problem
`public/sw.js` (68 Zeilen) ist "network first" ohne Timeout. Bei schlechter Verbindung (Halle ohne Empfang) wartet der Browser lange, bevor er auf den Cache zurückfällt. Keine Offline-Fallback-Seite vorhanden.

### Lösung
- Netz-Timeout (~4 s) mit `AbortController` in `fetch(request)` — bei Timeout Rückfall auf Cache
- Offline-Fallback-Seite `public/offline.html` (statisch, dezent, "Keine Verbindung — zuletzt gesehene Inhalte aus dem Cache")
- `sw.js` versucht Cache → falls nicht vorhanden → offline.html
- Bestehende Cache-Logik (`CACHE`, `MAX_EINTRAEGE`, `oeffentlich()`) bleibt unverändert
- Cache-Version auf `hp-oeffentlich-v2` bumpen (damit alte Caches gelöscht werden)

### Fertig-Kriterium
- `public/sw.js` hat Netz-Timeout (~4 s) mit `AbortController`
- `public/offline.html` existiert (statisch, deutsch)
- `npx tsc --noEmit` → 0 Fehler
- `npx vitest run` → non-DB-Tests grün
- Draft-PR erstellt

---

## Aufgabe 4: Teilen-Button (Web Share API + Fallback)

**Priorität**: Mobile Bedienbarkeit (P1)
**Status**: offen
**Branch**: —
**Aufwand**: S (≤ 1 Tag)

### Problem
Es gibt keinen Teilen-Button auf Spielzeilen, Mannschaftsköpfen oder Vereinsköpfen. Mobile Nutzer können Links nicht nativ teilen (Web Share API). Die Mobile-Roadmap (Phase 3.6) fordert `components/liga/teilen-button.tsx`.

### Lösung
- Neue Komponente `src/components/liga/teilen-button.tsx`
- `navigator.share()` wenn verfügbar (mobile)
- Fallback: Link in Zwischenablage (`navigator.clipboard.writeText`) mit `aria-live`-Hinweis "Link kopiert"
- Tippfläche ≥ 44 px (`min-h-11`)
- Text ohne Tracking-Parameter (nur die nackte URL)
- Einbindung: Spielzeile in `liga-ui.tsx`, Mannschaftskopf in `[team]/layout.tsx`, Vereinskopf in `verein/[slug]/layout.tsx` — aber nur EINE Stelle pro Durchlauf (z.B. erst Spielzeile)

### Fertig-Kriterium
- `teilen-button.tsx` existiert mit `navigator.share` + Clipboard-Fallback
- ≥ 44 px Tippfläche
- `npx tsc --noEmit` → 0 Fehler
- `npx vitest run` → non-DB-Tests grün
- Draft-PR erstellt (nur mit der Teilen-Button-Komponente + einer Einbindungs-Stelle)

---

## Aufgabe 5: ICS-Kalender-Feed je Mannschaft

**Priorität**: Mobile Bedienbarkeit / Datenqualität (P2)
**Status**: offen
**Branch**: —
**Aufwand**: M (2–3 Tage)

### Problem
Keine ICS-Kalender-Abonniermöglichkeit je Mannschaft. Mobile-Roadmap Phase 3.5 fordert `app/verein/[slug]/[team]/kalender.ics/route.ts`.

### Lösung
- Neue Route `src/app/verein/[slug]/[team]/kalender.ics/route.ts`
- Inhalt: nur öffentliche Spieldaten (Datum, Gegner, Halle)
- UID stabil aus `liga_spiel.id`
- `Cache-Control: public, s-maxage=3600`
- Button "Kalender abonnieren" auf der Mannschafts-Übersicht (`[team]/page.tsx`) — `webcal://`-Link + "Link kopieren"
- Tests: Format und Escaping (Vitest)
- Datenschutzseite um einen Satz ergänzen (keine Personendaten)

### Fertig-Kriterium
- `kalender.ics/route.ts` existiert und liefert gültiges ICS
- `Cache-Control` gesetzt
- Button auf Mannschafts-Übersicht
- `npx tsc --noEmit` → 0 Fehler
- `npx vitest run` → non-DB-Tests grün (inkl. neuem ICS-Test)
- Draft-PR erstellt

### Hinweis
- Ohne `DATABASE_ADMIN_URL` kann die Route lokal nicht voll getestet werden — ICS-Generierungs-Logik in einer pure Funktion auslagern und diese mit Vitest testen.
- Remote-Branches `origin/claude/kalender-offene-tage` und `origin/claude/kalender-screenshot-hoehe` existieren — prüfen auf Überschneidung. Wahrscheinlich anderer Kontext (Kalender-Anzeige, nicht ICS-Export).

---

## Erledigte Aufgaben

### Aufgabe 1: Sponsor-Splash Barrierefreiheit (a11y) — erledigt

- **Branch**: hp/aufgabe-sponsor-splash-a11y
- **PR**: #409 (Draft)
- **Datum**: 2026-10-16
- \`role="dialog"\` + \`aria-modal="true"\` + \`aria-label\`, Fokus auf Schließen-Button beim Öffnen, Fokus-Rückkehr beim Schließen, \`aria-label\` + \`min-h-11 min-w-11\` am Button. tsc 0 Fehler, vitest 667 grün.

## Blockierte Aufgaben

*(noch keine)*
