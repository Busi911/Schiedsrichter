# HandballerPate — Umsetzungsplan Vereinsverwaltung

Stand: 18.10.2026

## Preismodell

| Paket | Preis/Jahr (netto) | Inhalt |
|---|---|---|
| **Basis** | 300 € (Beta: 200 €) | Funktionsträgerverwaltung + App (Spiele, Ergebnisse, Tabellen, Dienste, Termine, Training) |
| **+ Vereinsverwaltung** | + 200 € (Beta: + 200 €) | Mitgliederverwaltung, Online-Beitritt, Beitragsklassen, SEPA, Neuigkeiten, Datenschutzverwaltung |
| **Gesamt** | 500 € (Beta: 400 €) | Basis + Vereinsverwaltung |
| **Sponsor** | + 200 € zusätzlich | Sponsor-Bild beim Öffnen der Vereinsseite. **Übernimmt immer den kompletten Vereinspreis** (Basis oder Basis + Add-on) plus 200 € für den Platz. Der Verein zahlt nichts. |

### Sponsor-Regelung

Ein Sponsor, der einem Handballverein die App ermöglichen möchte, übernimmt:
1. Den **kompletten Vereinspreis** — egal ob nur Basis (300 €) oder Basis + Vereinsverwaltung (500 €)
2. Plus **200 € für den Sponsor-Platz** — das Bild beim Öffnen der Vereinsseite

Der Verein zahlt nichts. Der Sponsor entscheidet, ob er nur die Basis oder auch das Add-on übernimmt.
Interessierte Sponsoren melden sich bei info@deweconsulting.de.

## Roadmap (öffentliche Roadmap-Seite: /roadmap)

Die öffentliche Roadmap hat drei Abschnitte:

1. **Stabil in die Zeit nach der Beta** (bis 30.11.2026) — Basis-Funktionen, in Arbeit
2. **Öffentliche App weiterentwickeln** (ab Dezember 2026) — Fan-Features als Ideen
3. **Vereinsverwaltung (optionales Add-on)** (ab Januar 2027) — Mitgliederverwaltung als „Geplant", Sponsor als „Geplant", restliche Punkte als „Idee"

## Phasen der Umsetzung

### Phase 1: Datenmodell und Migration (Woche 1)

- `mitglieder`-Tabelle: id, verein_id, name, vorname, geburtsdatum, email, telefon, geschlecht, status (aktiv/passiv/ausgetreten), eintrittsdatum, austrittsdatum, bemerkung
- `mitglied_mannschaft`-Tabelle: mitglied_id, mannschaft_id, saison, rolle (spieler/trainer/betreuer)
- `beitritt_antrag`-Tabelle: id, verein_id, name, vorname, geburtsdatum, email, telefon, geschlecht, mannschaft_id (optional), einwilligungen (JSON), erstellt_am, status (offen/angenommen/abgelehnt)
- RLS: Vereinsadmin sieht nur eigene Mitglieder. `beitritt_antrag` öffentlich schreibbar, nur Vereinsadmin darf lesen.
- `vereine` bekommt Feld `vereinsverwaltung_aktiv: boolean` (Default false)
- Drizzle-Migration → läuft beim Vercel-Deploy automatisch

### Phase 2: Admin-Oberfläche (Woche 2)

- `/admin/mitglieder` — Liste mit Suche, Filter nach Mannschaft, Status-Änderung
- `/admin/mitglieder/[id]` — Stammdaten bearbeiten, Mannschaften zuordnen, Austritt eintragen
- Excel-Import (bestehende Logik aus Funktionsträgerverwaltung wiederverwenden)
- CSV-Export

### Phase 3: Online-Beitritt (Woche 3)

- `/verein/[slug]/beitritt` — öffentliche Seite, Formular mit:
  - Name, Vorname, Geburtsdatum, Email, Telefon, Geschlecht
  - Gewünschte Mannschaft (Dropdown aus `liga_mannschaften`)
  - DSGVO-Einwilligungen: Datenschutzerklärung, Fotos bei Minderjährigen
  - Keine Zahlung — nur Antrag, der Vereinsadmin nimmt an
- Server Action speichert `beitritt_antrag`, Mail an Vereinsadmin
- Vereinsadmin kann annehmen → wird `mitglied` mit Status „aktiv"

### Phase 4: Abrechnungs-Integration (Woche 4)

- `vereinsverwaltung_aktiv` steuert Sichtbarkeit im Admin-Bereich
- Wenn aktiv: Preis in `/system/abrechnung` + 200 € (regulär) oder + 200 € (Beta)
- Sponsor übernimmt immer den kompletten Vereinspreis (Basis oder Basis + Add-on) + 200 € Sponsor-Platz
- `betragNetto` in `abrechnung.ts` addiert den Add-on-Preis, wenn `vereinsverwaltung_aktiv`

### Phase 5: Abnahme mit Pilotverein (Woche 5-6)

- Ein Beta-Verein testet die Mitgliederverwaltung
- DSGVO prüfen (Einwilligungen, Löschfristen, Auskunftsersuchen)
- Förderantrag durch den Pilotverein einreichen (docs/foerderantrag-deinehrenamt.md)

## Förderbezug

#deinehrenamt.de (LEAH/Landessportbund Hessen) fördert Digitalisierungsmaßnahmen im Ehrenamt:
- Bis zu 30.000 € pro Projekt
- Gemeinnützige Sportvereine sind antragsberechtigt
- „Digitalisierung zur Ehrenamtsgewinnung (Homepage, Anmeldungen)" — direkte Förderung
- Projekte bis 1.000 € ohne Verwendungsnachweis (novellierte Richtlinie 2025)
- Online-Antrag: https://antrag.hessen.de/hcc/start/index.html?formId=fm00005

Siehe: docs/foerderantrag-deinehrenamt.md
