# Plan: Bedienbarkeit und Vereinfachung (Stand 07.10.2026)

Ziel: weniger Komplexität für Vereinsadmins und im Code, ohne Funktionen zu verlieren, die Vereine nutzen.
Reihenfolge = Empfehlung (Nutzen für Anwender gegen Risiko/Aufwand).

## 1. Einstellungen entrümpeln
**Problem:** `admin/einstellungen/page.tsx` hat 1.089 Zeilen, 17 Formulare, ~10 Bereiche. Ein neuer Admin braucht nur Vereins-ID und Spielhallen.

| Lösung | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| A (empfohlen) | Oben „Erste Schritte“ (Vereins-ID, Spielhallen, Logo, Farbe). Alles andere unter „Erweitert“ eingeklappt. Hallenplan-Import und Zusatzquellen nur dort. Keine Funktion fällt weg. | klein (1 Tag) | gering |
| B | Seite in Unterseiten teilen (Verein · Öffentliche Seite · Dienste · Mails · Rechtliches). | mittel | mittel (viele Links/Hilfetexte anpassen) |
| C | Nichts ändern. | – | – |

## 2. Mail-Schalter zusammenfassen
**Problem:** 5 persönliche Schalter (Wochenübersicht, Terminerinnerung, offene Schiedsrichter-Dienste, offene Zeitnehmer-Dienste, Dienste-Broadcast) + Vereinsschalter. Unterschied kaum verständlich.

| Lösung | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| A (empfohlen) | In der Oberfläche nur 2 Schalter: „Erinnerungen an meine Termine und Dienste“ (Terminerinnerung + offene Schiedsrichter/Zeitnehmer) und „Wochenübersicht“. Der Broadcast bleibt ein Vereinsschalter des Admins. Datenbank-Spalten bleiben, nur die Anzeige wird zusammengefasst (kein Migrationsrisiko). Abmelde-Links bleiben gültig. | klein–mittel | gering |
| B | Alles auf einen einzigen Schalter „Mails an mich“. | klein | Verlust an Feinsteuerung |
| C | Nichts ändern. | – | – |

## 3. Wart-Seiten zusammenlegen
**Problem:** Zeitnehmerwart (989 Z.), Ordnerwart (753), Schiedsrichterwart (548) und die Eintragen-Seiten (je ~500 Z. Aktionen) sind weitgehend Kopien.

| Lösung | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| A (empfohlen) | Gemeinsame Bausteine (Komponenten/Aktionen) herausziehen, die drei Seiten bleiben unter den heutigen URLs und werden dünn. Schrittweise: zuerst die Eintragen-Aktionen, dann die Wart-Seiten. | groß (mehrere Tage, in Etappen) | mittel (Rollenlogik, gut testen) |
| B | Nur die zwei Eintragen-Aktionen (Ordner/Zeitnehmer) zusammenlegen. | mittel | gering |
| C | Nichts ändern. | – | – |

## 4. Hallenplan-Weg abschalten
**Problem:** Zwei Wege liefern Termine (Hallenplan/Hallen-ID und Liga-Sync), ~4.000 Zeilen plus Sonderregeln. Neue Vereine haben den Hallenplan schon aus.

| Lösung | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| A | Erst abschalten, wenn Freundschaftsspiele/Turniere anders gelöst sind. Bis dahin nur Hinweise in den Einstellungen verkürzen. | klein jetzt | gering |
| B | Sofort entfernen, Freundschaftsspiele/Turniere nur von Hand. | groß | hoch (Bestandsvereine verlieren Automatik) |
| C (empfohlen jetzt) | Als Systemadmin-Werkzeug lassen, für Vereine ausblenden, sobald deren Import aus ist. | klein | gering |

## 5. Kleinigkeiten
- Reiter „Testspiele“ umbenennen in „Freundschaftsspiele & Turniere“.
- Profil: „Meine Termine“ und „Mein Kalender“ zu einer Karte.
- Admin-Start: Karte „Letzte Ergebnisse“ entfernen (steht öffentlich und in der Statistik).
- Hilfe: Tabelle „Wer darf was“ (Rollen).

## Vorgehen
Jede Etappe als eigener PR, mit Tests, erst nach „Merge“ zusammenführen. Reihenfolge nach Entscheidung.
