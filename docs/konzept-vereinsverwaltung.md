# Konzept: Handball-Vereinsverwaltung für HandballerPate

Stand: 18.10.2026 · Autor: Claude (im Auftrag des Betreibers) · Status: gilt (Entscheidungen vom 18.10.2026, siehe Abschnitt 9); alle Entscheidungen E1–E7 getroffen

Dieses Dokument ersetzt keine Detailpläne, sondern gibt ihnen ein gemeinsames Ziel. Es beantwortet vier Fragen:
1. Wo stehen wir wirklich? (Abschnitt 2)
2. Was soll die Vereinsverwaltung sein, und was ausdrücklich nicht? (Abschnitte 3–4)
3. Was bauen wir in welcher Reihenfolge, und woran erkennen wir, dass ein Schritt fertig ist? (Abschnitte 5–7)
4. Was muss der Betreiber entscheiden, bevor weitergebaut wird? (Abschnitt 9)

Was ich aus dem Repo belegen kann, steht ohne Zusatz da. Was Annahme oder Vermutung ist, ist als **[Annahme]** markiert und gehört mit einem Pilotverein geprüft. Marktaussagen stehen mit Quellen im Anhang; belastbare Preise und Funktionsvergleiche zu Wettbewerbern habe ich nicht gefunden und erfinde sie nicht.

---

## 1. Kurzfassung

- **Das Gefühl „wir haben kein Ziel“ stimmt.** Die Vereinsverwaltung ist aus einem datenmodellgetriebenen Plan (Tabellen → Liste → Formular → Abrechnung) entstanden, nicht aus einem Bild davon, was ein Handballverein damit am Montagabend tun will. Gebaut wurde in einer Woche viel (Mitgliederliste, Import/Export, Online-Beitritt), aber ohne Pilotverein, der es benutzt, und ohne Kriterium, wann etwas „fertig“ ist.
- **Die öffentliche Roadmap und der interne Umsetzungsplan widersprechen sich** („noch nicht terminiert“ gegen „Woche 1–6, ab Januar 2027“). Dazu liegen vier Hermes-/Claude-Code-Auftragsdokumente im Repo, die teilweise überholt sind.
- **Zielvorschlag:** HandballerPate wird das **Betriebssystem des Handballvereins für Spielbetrieb, Ehrenamt und Mitglieder**: Mitglieder und Mannschaften hängen an den automatisch geladenen Liga-Daten, Ehrenamtsdienste und Mitteilungen laufen im selben System. **Nicht** das Ziel: eine allgemeine Vereinssoftware mit Buchhaltung, Zahlungsabwicklung und Spielerpass. Das können andere besser, und die Spielberechtigung läuft ab 2026/27 über Handball360 des DHB.
- **Der Unterschied, den wir liefern können und andere nicht:** Mitglied → Mannschaft → Spiel → Dienst in einem Datenbestand, gefüttert aus nuLiga/handball.net. Daran richten wir die Reihenfolge aus.
- **Empfehlung für die nächsten 6 Wochen:** erst Ruhe in der Synchronisation, dann einen Pilotverein festlegen und mit ihm die Mitgliederverwaltung bis „Mannschafts-Kader und Saisonwechsel“ fertig machen. **Beiträge/SEPA erst danach** und nur in der kleinsten sinnvollen Form (Beitragsliste + SEPA-Datei-Export), weil dort rechtlich und sicherheitstechnisch das größte Risiko liegt.
- **Sieben Entscheidungen** brauche ich vom Betreiber (Abschnitt 9). Ohne sie bleibt jede Planung Spekulation.

---

## 2. Ist-Lage (geprüft am Code und an den Dokumenten)

### 2.1 Was HandballerPate heute ist

Drei Schichten, unterschiedlich reif:

| Schicht | Inhalt | Reife |
|---|---|---|
| **Öffentliche Fan-App** | Spiele, Ergebnisse, Tabellen, Statistik, Favoriten, installierbar; Quellen nuLiga, handball.net, NDR | Hoch, aber im Spielbetrieb noch **instabil**: diese Woche mehrere Korrekturen (Zwischenstände, verlegte Spiele, handball.net-Status, Live-Fenster) |
| **Spielbetrieb & Ehrenamt** | Funktionsträger, Dienste (Schiri, Zeitnehmer, Ordner, Kiosk, Kasse, eigene Dienste, Fahrgemeinschaft), Training, Vereinstermine, Kalender, Auswärtsspiele | Hoch im Funktionsumfang, **Abnahme mit Vereinen steht aus** (so auch auf der Roadmap) |
| **Vereinsverwaltung (Add-on)** | Mitgliederliste, Funktionsträger-Übernahme mit Duplikatprüfung, Mannschaftszuordnung je Saison, Arten der Mitgliedschaft, Excel-Import/-Export, Online-Beitritt mit Antragsliste | **Technisch breit, fachlich unvalidiert**: kein Pilotverein, keine Demo-Daten, keine Hilfe-Abnahme durch einen echten Nutzer |

Umfang: rund 900 Dateien unter `src` (davon etwa 150 Testdateien), 121 Migrationen, in den letzten 14 Tagen 84 Commits, davon 44 allein am 18.10.

### 2.2 Was in der Vereinsverwaltung konkret existiert

- Tabellen `mitglied`, `mitglied_mannschaft`, `mitgliedsart`, `beitritt_antrag`, `beitragsklasse` (die letzte ist **angelegt, aber ohne Oberfläche und ohne Logik**).
- Freischaltung je Verein nur durch den Systemadmin; Preis-Aufschlag ist in `betragNetto` eingebaut.
- Rechtegrundlage: `istAdmin` (schreibt), `istAdminLesend` (liest). Keine feineren Rollen.
- **Mitglieder haben kein Konto.** Konten (`user`) gibt es nur für Funktionsträger und Admins. Spieler, Eltern und passive Mitglieder kommen nur als Datensatz vor. Die Verbindung zwischen beiden Welten ist die optionale `mitglied.user_id`.

### 2.3 Befunde

1. **Kein Nordstern.** Die Phasen im Umsetzungsplan (Datenmodell, Admin-UI, Beitritt, Abrechnung, Pilot) beschreiben Bauteile, keine Ergebnisse für einen Verein. Phase 5 (Pilotabnahme) ist die einzige mit einem echten Nutzer, und sie steht am Ende statt am Anfang.
2. **Aufmerksamkeit ist zerfasert.** Von den Commits seit dem 4.10. betreffen etwa 11 die Vereinsverwaltung und rund 26 Synchronisation und Ergebnisanzeige (nach grober Stichwortzählung). Das ist verständlich (Spielbetrieb ist das Kernversprechen), aber es heißt: Die Vereinsverwaltung wird nebenbei gebaut, ohne dass jemand entschieden hat, dass sie Priorität hat.
3. **Zwei Planstände.** Öffentliche Roadmap: Vereinsverwaltung „noch nicht terminiert, nichts zugesagt“. `docs/umsetzungsplan-vereinsverwaltung.md`: „ab Januar 2027“, Woche 1–6, Preis fix. Beides gleichzeitig kann nicht gelten.
4. **Dokumenten-Wildwuchs.** `docs/` enthält vier Auftragsdateien für Hermes/Claude Code (`claude-code-aufgabe-vereinsverwaltung.md`, `…-phase1.md`, `claude-code-phase1-anweisung.md`, `umsetzungsplan-vereinsverwaltung.md`), einen Plan zur Vereinfachung und einen Förderantrags-Entwurf. Phase 1–3 daraus ist umgesetzt, aber teils anders (z. B. kein `/admin/mitglieder/[id]`, Beitritt mit Duplikatprüfung statt einfacher Liste). Niemand weiß auf Anhieb, was gilt.
5. **Die Förderantrags-Skizze verspricht mehr, als steht.** Sie nennt „automatische Zuordnung zu Funktionsträger-Diensten“ und ein Projektvolumen von 5.000 €. Diese Zahl ist nicht belegt; die Verbindung Mitglied → Dienste besteht nur über `user_id` und nur für Personen mit Rolle.
6. **Preis-Unstimmigkeit.** `PREIS_VEREINSVERWALTUNG_BETA` ist gleich `PREIS_VEREINSVERWALTUNG` (je 200 €): Es gibt keinen Beta-Vorteil für das Add-on, obwohl der Rest der Preislogik einen vorsieht. Entweder gewollt (dann in der Kommunikation sagen) oder ein Versehen.
7. **Widerspruch zur Spezifikation.** Der Auftrag sah vor, dass der **Vereinsadmin** das Add-on in den Einstellungen selbst einschalten kann; umgesetzt ist „nur Systemadmin“. Das ist vertretbar (Abrechnung), muss aber bewusst entschieden sein.
8. **Qualität der Bausteine ist gut.** Mandantentrennung (RLS) ist für alle neuen Tabellen getestet, Duplikatprüfung, Formel-Injection-Schutz beim Export und Missbrauchsschutz beim Formular sind da. Das Problem ist nicht Handwerk, sondern Richtung.
9. **Bekannte Lücken in dem, was gebaut ist:** keine Paginierung der Mitgliederliste, keine Tests der Server-Actions, keine Demo-Daten für das Add-on, kein Link „Mitglied werden“ auf der öffentlichen Vereinsseite, keine automatische Löschfrist, rechtliche Prüfung der Einwilligungen offen, 43 passiv importierte Mitglieder ohne Werkzeug, sie auf „aktiv“ zu setzen.

### 2.4 Was von außen dazukommt

- **Handball360 wird ab Saison 2026/27 die zentrale Plattform für Registrierung, Spielberechtigungen und Spielbetriebsverwaltung des DHB.** Der Antrag auf Spielberechtigung läuft über Verein, Spieler und Landesverband; die Einführung ist in mehreren Landesverbänden verschoben. Eine öffentliche Schnittstelle habe ich nicht gefunden. **Folge:** Ein eigener Spielerpass ist keine Option, und wir sollten ihn nicht anbieten.
- **Allgemeine Vereinssoftware gibt es reichlich** (u. a. easyVerein, SportMember, Sportmeo, GLS Vereinsmeister) mit Buchhaltung, Beitragsabrechnung und Mitgliederverwaltung. Auf Preise und Funktionsumfang gehe ich nicht ein, weil die gefundenen Vergleichsseiten dafür nichts Belastbares liefern. Entscheidend ist die Konsequenz: Ein Verein, der schon eine davon nutzt, wechselt nicht für ein Add-on, das nur „auch Mitglieder“ kann.

---

## 3. Zielbild

> **HandballerPate ist das Betriebssystem eines Handballvereins für Spielbetrieb, Ehrenamt und Mitglieder: Wer im Verein ist, in welcher Mannschaft er spielt, wann gespielt wird und wer welchen Dienst übernimmt, steht an einer Stelle und aktualisiert sich aus den Verbandsdaten selbst.**

Drei Leitsätze:

1. **Handball zuerst.** Jede Funktion muss etwas können, was eine allgemeine Vereinssoftware nicht kann, weil ihr die Spielplan- und Ergebnisdaten fehlen. Alles, was jede Software kann (Buchhaltung, Mitgliedsausweise, Shop), ist Nebensache.
2. **Ein Datenbestand, keine Inseln.** Mitglied, Mannschaft, Spiel, Dienst und Mitteilung verweisen aufeinander. Wer in Excel doppelt pflegen muss, hat verloren.
3. **Ehrenamt entlasten, nicht verwalten.** Die meisten Verantwortlichen haben abends 20 Minuten. Standard ist: das System schlägt vor, der Mensch bestätigt.

### Was der Verein am Ende sagen soll
- „Zum Saisonstart rutschen unsere Jugendlichen in die neue Altersklasse und ich bestätige nur noch.“
- „Wenn ein Spiel verlegt wird, wissen Trainer, Eltern, Schiedsrichter und Kuchendienst Bescheid.“
- „Neue Mitglieder melden sich online an, ich prüfe und nehme auf.“
- „Die Meldung an den Landessportbund ist ein Knopfdruck.“ **[Annahme: Bestandserhebung, siehe Abschnitt 5, mit dem Pilotverein bestätigen]**

---

## 4. Abgrenzung

### Wir bauen
Mitglieder und Beitritt · Mannschafts-Kader je Saison mit Saisonwechsel · Mitteilungen an Mannschaften und Gruppen · Beitragsliste und SEPA-Mandate mit Exportdatei · Einwilligungen, Auskunft, Löschfristen · Auswertungen und Bestandsmeldung · Selbstbedienung für Mitglieder und Eltern

### Wir bauen bewusst nicht
| Nicht | Warum |
|---|---|
| Buchhaltung, Kassenbuch, Steuererklärung | Aufwändig, haftungsrelevant, gut besetzt von Fremdsoftware. Wir liefern **Exportdateien**. |
| Zahlungsabwicklung und Bankanbindung | Regulierung und Haftung. Wir erzeugen eine SEPA-Datei, die der Verein bei seiner Bank einreicht. |
| Spielerpass und Spielberechtigung | Läuft über Handball360. Höchstens ein **Hinweis/Verweis** und später ein Abgleich, falls der DHB eine Schnittstelle freigibt. |
| Hallenbelegung über den eigenen Verein hinaus, Ticketing, Fanshop | Nicht der Schmerz, den wir lösen. |
| Eigener Live-Ticker | Hängt an der Freigabe der Datenquelle (siehe Roadmap). |

### Koexistenz statt Verdrängung
Viele Vereine haben schon Software. Deshalb gilt: **Import rein** (Excel gibt es) und **Export raus** (gibt es) sind Pflicht, nicht ein Nebenprodukt. Ein Verein soll uns **neben** seiner Buchhaltung nutzen können.

---

## 5. Funktionsmodell

Bewertung: **Nutzen** = hilft dem Verein spürbar, **Alleinstellung** = nutzt unsere Handball-Daten, **Risiko** = rechtlich/technisch.

| # | Modul | Inhalt | Stand | Nutzen | Alleinstellung | Risiko |
|---|---|---|---|---|---|---|
| A | Mitglieder | Stammdaten, Status, Art, Eintritt/Austritt, Import/Export | gebaut | hoch | gering | gering |
| B | Online-Beitritt | Formular, Antragsliste, Annahme | gebaut | mittel | gering | mittel (Einwilligungen, Minderjährige) |
| C | **Kader & Saisonwechsel** | Mitglied ↔ Mannschaft je Saison, Vorschlag aus Geburtsdatum und Altersklasse, Übernahme ins neue Jahr, Trainer automatisch | teilweise (Zuordnung von Hand) | **sehr hoch** | **hoch** | gering |
| D | **Mitteilungen** | Nachricht an Mannschaft/Gruppe/Eltern, Verlegungs- und Spieltagsinfo, Rückmeldung (kommt/kommt nicht) | nicht gebaut (nur Systemmails) | **sehr hoch** | **hoch** | gering (Mail-Infrastruktur und Abmeldung vorhanden) |
| E | Beiträge | Beitragsklassen (Tabelle existiert), Zuordnung über Art/Alter, Beitragsliste, SEPA-Mandate, Export-XML, Zahlungsstatus von Hand | nicht gebaut | hoch | gering | **hoch** (Zahlungsdaten, Recht) |
| F | Selbstbedienung | Mitglied/Eltern ändern Daten, sehen Mannschaft und Termine, tragen sich für Dienste ein | nicht gebaut (Mitglied hat kein Konto) | hoch | mittel | mittel (Identität, Eltern-Kind) |
| G | Datenschutz | Einwilligungen als Daten, Auskunft, Löschfristen, Protokoll | nur Bemerkungsfeld | Pflicht | gering | **hoch**, wenn fehlend |
| H | Auswertung & Meldung | Altersstruktur, Zu-/Abgänge, Bestandsmeldung an den Landessportbund **[Annahme]** | nicht gebaut | mittel | mittel | gering |
| I | Dienste-Brücke | Mitglied ↔ Funktionsträger/Dienst: wer ist Mitglied, wer hat Rolle, Dienststunden | Ansatz (`user_id`) | mittel | **hoch** | gering |

**Die Reihenfolge ergibt sich aus „Alleinstellung × Nutzen ÷ Risiko“:** C und D zuerst, dann G (Pflicht vor jeder Ausweitung), dann H, dann F, zuletzt E.

### Warum Kader und Mitteilungen vor Beiträgen
- Beiträge ist das Feld mit der größten Konkurrenz und dem größten Risiko (IBAN-Speicherung, Mandate, Satzungsgrundlage, Rückbuchungsfrist). Dort sind wir hinter bestehender Software.
- Kader und Mitteilungen sind genau das, was Trainer jede Woche brauchen und was durch unsere Spiel- und Mannschaftsdaten erst möglich wird. Außerdem sind es die Funktionen, die **Eltern und Trainer** in die App holen, nicht nur den Vorstand.

### Modul C im Detail (der erste große Schritt)
Ziel: Am Saisonanfang muss der Verein nicht mehr jede Person neu zuordnen.
- Mannschaftsliste kommt aus den Liga-Mannschaften (gibt es).
- **Vorschlag** je Mitglied aus Geburtsdatum, Geschlecht und Altersklasse der Mannschaften. Die Stichtage richten sich nach der Spielordnung des Verbands und müssen geprüft werden **[Annahme]**; sie dürfen nicht im Code geraten werden.
- Saisonwechsel als geführter Ablauf („Neue Saison 2027/28: 38 Vorschläge, 12 offen“), nie still.
- Trainer und Betreuer aus den Funktionsträgern übernehmen (bisher ausdrücklich nicht gebaut).
- Saisonstart im Handball ist am 1. Juli, also ist **Juli 2027 der natürliche Termin**, auf den Modul C und D fertig sein sollten **[Annahme zum Spieljahr]**.

### Modul D im Detail
- Empfänger: Mannschaft (Mitglieder dieser Mannschaft laut Kader), Gruppe (z. B. alle Trainer), Eltern.
- Wiederverwendet: `sendMail`, E-Mail-Layout, Abmelde-Link, Admin-Hinweis-Regel.
- Neu: Entwurf, Vorschau, „Wer bekommt das?“-Liste, Protokoll. **Opt-in-Frage:** Mitglieder ohne Einwilligung in Vereinsmails nicht anschreiben (Modul G).
- Rückmeldung per Klick in der Mail (kommt/kommt nicht) nutzt das vorhandene Muster der Vereinstermine.

### Modul E im Detail (klein halten)
1. Beitragsklassen mit Betrag und Regel (nach Art oder Altersgruppe).
2. **Beitragsliste je Jahr** (wer schuldet was). Das ist ohne Zahlungsdaten schon nützlich.
3. SEPA-Mandate: IBAN, Kontoinhaber, Datum, Mandatsreferenz. Gläubiger-ID des Vereins in den Einstellungen. IBAN **verschlüsselt** speichern und nur für Berechtigte anzeigen.
4. Export einer SEPA-Lastschriftdatei (XML) und einer Liste für die Buchhaltung.
5. Zahlungsstatus manuell setzen, Mahnliste.
Nicht: Bankanbindung, automatischer Zahlungsabgleich.
Voraussetzungen, die **vor** Beginn zu klären sind: Satzungsgrundlage für den Lastschrifteinzug beim Pilotverein, Vorabankündigungsfrist, Umgang mit Mandaten Minderjähriger (Unterschrift der Erziehungsberechtigten) und neue Rolle „Kassenwart“ mit eigenem Zugriff (siehe Abschnitt 6).

---

## 6. Datenmodell, Rechte, Sicherheit

### Datenmodell (Skizze der Erweiterungen)
- **Kader:** `mitglied_mannschaft` besteht. Ergänzen: Herkunft der Zuordnung (von Hand / Vorschlag / aus Funktionsträger), Gültigkeit je Saison.
- **Mitteilung:** `mitteilung` (Verein, Absender, Betreff, Text, Empfängerregel, gesendet am), `mitteilung_empfaenger` (Mitglied oder Konto, Zustellstatus, Antwort).
- **Kontakt/Eltern:** `mitglied_kontakt` (Eltern oder Erziehungsberechtigte eines minderjährigen Mitglieds, mit eigener E-Mail und Einwilligung). Heute hat ein minderjähriges Mitglied nur die eine `email`.
- **Einwilligung:** `mitglied_einwilligung` (Art, Zeitpunkt, Quelle, Widerruf) statt einer Textzeile in der Bemerkung.
- **Beitrag/Mandat:** `beitragszuordnung`, `sepa_mandat` (IBAN verschlüsselt), `beitragsforderung`.
- **Protokoll:** Wer hat wann welches Mitglied gelesen/geändert/exportiert (für Auskunft und Missbrauchserkennung).

### Rollen
Heute: Admin (schreibt) und Admin lesend. Die Vereinsverwaltung braucht mehr Abstufung, sonst sieht jeder mit Lesezugriff alle Personendaten:
| Rolle | Darf |
|---|---|
| Vorstand/Admin | alles |
| **Kassenwart** (neu) | Beiträge und Mandate, nur lesend auf Stammdaten |
| **Abteilungsleiter/Mitgliederwart** (neu) | Mitglieder, Anträge, Kader |
| **Trainer** | Kader und Kontaktdaten **der eigenen Mannschaft**, Mitteilungen an sie |
| Mitglied/Eltern (später) | nur die eigenen Daten |

### Sicherheit und Datenschutz (Mindestniveau)
- Mandantentrennung bleibt Pflicht (RLS plus Test je neuer Tabelle, wie bisher).
- Zahlungsdaten und Geburtsdaten Minderjähriger sind die sensibelsten Daten, die wir je gespeichert haben. **Verschlüsselung auf Anwendungsebene** für IBAN, **Zugriffsprotokoll**, **Backup-Konzept**, **Löschfristen**.
- Auftragsverarbeitung: Der AVV unter `/admin/avv` muss für die Vereinsverwaltung geprüft und erweitert werden (Personenkategorien, Zahlungsdaten, Unterauftragnehmer).
- **Juristische Prüfung steht aus** (Datenschutzerklärung, AVV, Einwilligungstexte, Minderjährige). Für Mitgliederdaten und Zahlungsdaten ist das keine Kür. Empfehlung: externe Prüfung **vor** dem ersten Produktivverein mit Beitragsdaten, nicht danach. Die Prüfung ist ausdrücklich nicht Teil dieses Entwurfs und ersetzt keine Rechtsberatung.

---

## 7. Geschäftsmodell

- **Heute:** Basis 300 € netto im Jahr (Beta 200 €), Add-on Vereinsverwaltung +200 € (Beta ebenfalls +200 €), Sponsor übernimmt alles zuzüglich 200 €.
- **Hypothese:** Das Add-on wird erst dann gekauft, wenn es einen Handball-spezifischen Nutzen bringt (Modul C und D). Reine Mitgliederliste und Formular rechtfertigen den Aufpreis neben bestehender Vereinssoftware nicht.
- **Zu klären:** (1) Beta-Preis des Add-ons gleich Regelpreis, gewollt? (2) Wird das Add-on **einzeln** freigeschaltet oder in die Basis aufgenommen, sobald Kader und Mitteilungen fertig sind? Das ist eine Preis- und Positionierungsfrage. Vorschlag: Kader und Mitteilungen in die Basis, weil sie die Ehrenamts-App stärken und Trainer wie Eltern binden; das Add-on wird zu „Mitglieder, Beiträge, Datenschutz“.
- **Förderung:** #deinehrenamt (LSB Hessen) kommt für Digitalisierung der Ehrenamtsgewinnung und Anmeldungen in Betracht. Antragsteller wäre der Pilotverein. Die im Entwurf genannten 5.000 € und die Förderfähigkeit sind **nicht geprüft**; vor Antrag Richtlinie und Verwendungsnachweis klären.

---

## 8. Plan mit Meilensteinen und Fertig-Kriterien

Zeitangaben sind Richtwerte für die Planung, keine Zusagen nach außen. Jeder Meilenstein endet mit einem **Abnahmekriterium, das ein Mensch im Verein bestätigt**.

| Meilenstein | Zeitraum | Inhalt | Fertig, wenn … |
|---|---|---|---|
| **M0 Ruhe und Richtung** | bis 30.11.2026 | Synchronisation stabil (Überwachung grün), Entscheidungen E1–E7 getroffen, Pilotverein und Ansprechperson festgelegt, 3 Kurzgespräche (Vorstand, Trainer, Kassenwart) zu Alltag und Schmerzpunkten, Docs konsolidiert | Überwachung eine Woche ohne Befund; Pilot benannt (TSF Heuchelheim); dieses Konzept gilt |
| **M1 Pilot-Reife Mitglieder** | Dezember 2026 | Paginierung, Server-Action-Tests, Demo-Daten, Hilfe und Link „Mitglied werden“, Rolle Mitgliederwart, Datenschutz-Basis (Einwilligungen als Daten, Auskunft als Export, Löschfrist-Vorschlag), Knopf „passive Importe auf aktiv“ | Pilotverein hat seine Mitglieder drin und sagt: „So pflege ich sie jetzt wirklich“ |
| **M2 Kader und Saisonwechsel** | Januar bis März 2027 | Modul C: Vorschläge aus Alter/Mannschaft, Trainer aus Funktionsträgern, geführter Saisonwechsel (zuerst als Probelauf im Pilot) | Pilotverein baut die Saison 2027/28 damit auf, nicht in Excel |
| **M3 Mitteilungen** | März bis Mai 2027 | Modul D inkl. Eltern-Kontakte und Einwilligung, Rückmeldung per Klick | Ein Trainer verschickt Spieltagsinfo über die App statt per Messenger-Gruppe |
| **M4 Datenschutz und Meldung** | parallel zu M3 | Modul G vollständig, Modul H (Auswertung, Bestandsmeldung **nach Bestätigung des Formats mit dem Verein**) | Rechtliche Prüfung durch, Meldung exportierbar |
| **M5 Saisonstart 2027/28** | Juli 2027 | Echter Saisonwechsel im Pilot und in 2–3 weiteren Vereinen | Mindestens 3 Vereine haben den Wechsel ohne Support durchgezogen |
| **M6 Beiträge (klein)** | ab Herbst 2027, nur bei Bedarf aus den Gesprächen | Modul E in der kleinsten Form | Pilotverein stellt ein Beitragsjahr damit zusammen |
| **M7 Selbstbedienung** | nach M6 | Modul F | Mitglieder/Eltern nutzen es ohne Anleitung |

Hinweis zur Reihenfolge: Modul E ist nach hinten gerutscht, **weil es das größte Risiko hat und am wenigsten zu unserem Alleinstellungsmerkmal beiträgt.** Wenn die Gespräche in M0 zeigen, dass Beiträge der eigentliche Schmerz sind, ziehen wir es vor, nehmen dann aber die Voraussetzungen aus Abschnitt 5 ernst.

---

## 9. Entscheidungen, die der Betreiber treffen muss

Entscheidung des Betreibers am 18.10.2026: **E1 ja, E2 TSF Heuchelheim (Betreiber ist selbst Ansprechperson), E3 ja, E4 ja, E5 ja, E6 Betreiber prüft rechtlich selbst, E7 ja.**

| # | Frage | Mein Vorschlag → Entscheidung |
|---|---|---|
| E1 | **Positionierung:** Handball-Betriebssystem (Abschnitt 3) oder allgemeine Vereinsverwaltung? | Handball-Betriebssystem. Allgemeine Software ist ein Verlustgeschäft. → **Ja** |
| E2 | **Pilotverein** und eine feste Ansprechperson, die in jedem Meilenstein abnimmt | Einen aktiven Beta-Verein mit Jugendabteilung wählen, damit Altersklassen und Eltern vorkommen. → **TSF Heuchelheim**; der Betreiber ist selbst die Ansprechperson und nimmt die Meilensteine ab; der Verein hat Jugendmannschaften, damit kommen Altersklassen und Eltern im Pilot vor |
| E3 | **Reihenfolge:** Kader und Mitteilungen vor Beiträgen? | Ja (Abschnitt 5). → **Ja** |
| E4 | **Mitglieder-Zugang:** Bekommen Mitglieder/Eltern später ein Konto oder Magic-Link-Zugang? | Magic-Link ohne Passwort, an die eigene Mitglieds-E-Mail gebunden; Konto nur für Funktionsträger wie bisher. → **Ja** |
| E5 | **Add-on:** Kader/Mitteilungen in die Basis, Rest ins Add-on? Beta-Preis des Add-ons? Darf der Vereinsadmin es selbst einschalten? | Ja zur Aufteilung; Beta-Preis bewusst festlegen und kommunizieren; Einschalten nur durch Systemadmin, solange die Abrechnung von Hand läuft. → **Ja** (der konkrete Beta-Preis des Add-ons ist damit noch nicht festgelegt) |
| E6 | **Rechtliche Prüfung:** externe Prüfung vor dem ersten Verein mit echten Beitragsdaten, wer organisiert und bezahlt sie? | Ja, vor M6, und die Einwilligungstexte schon vor M1/M3. → **Betreiber prüft selbst rechtlich** (Umfang und ob eine externe Stelle hinzukommt, entscheidet er vor M6) |
| E7 | **Priorität gegen Synchronisation:** Wie viel Zeit geht in Spielbetrieb-Stabilität gegen Vereinsverwaltung? | Feste Regel: Solange die Überwachung einen Befund meldet, hat der Befund Vorrang; sonst gehört die Woche einem Meilenstein. → **Ja** |

---

## 10. Steuerung: damit es sich wieder nach Ziel anfühlt

1. **Ein Nordstern.** Vorschlag: *Anzahl der Vereine, die ihre Mannschaftszuordnung für eine Saison in HandballerPate pflegen.* Eine Zahl, sichtbar im Systembereich. Alles, was sie nicht bewegt, ist zweitrangig.
2. **Eine Wahrheit für den Plan.** Öffentliche Roadmap (`lib/roadmap.ts`) und dieses Konzept müssen übereinstimmen. Roadmap-Texte folgen der Entscheidung zu E1–E3, nicht umgekehrt.
3. **Ein Thema pro Woche.** Pro Woche höchstens ein Meilenstein-Thema plus Betrieb. Keine neuen Nebenfelder (z. B. Sponsor, Hilfe-Ausbau), solange M1 offen ist.
4. **Auftragsdokumente aufräumen.** Die vier Hermes-/Claude-Code-Dateien in `docs/` werden als „überholt, siehe Konzept“ markiert oder gelöscht; nur dieses Konzept gilt. Wer neue Aufträge schreibt, schreibt sie gegen Meilensteine, nicht gegen Tabellen.
5. **Gespräche vor Code.** M0 enthält drei Kurzgespräche mit echten Nutzern. Ohne sie wissen wir nicht, ob Kader und Mitteilungen wirklich vor Beiträgen kommen. Diese Annahme ist die größte unbewiesene in diesem Konzept.

---

## 11. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Datenschutzverstoß mit Mitglieds- oder Zahlungsdaten | existenzgefährdend für das Produkt | Prüfung vor M6, Mindestniveau Abschnitt 6, kein IBAN ohne Verschlüsselung und Protokoll |
| Wir bauen breit statt tief und bleiben hinter bestehender Vereinssoftware | Add-on wird nicht gekauft | Fokus auf Alleinstellung (C, D, I), Koexistenz über Import/Export |
| Sync-Probleme binden die Zeit | Vereinsverwaltung bleibt Nebensache | Regel E7, Überwachung, klare Zuständigkeit |
| Handball360 verändert den Spielbetrieb für Vereine | Annahmen zu Meldungen/Spielberechtigung wackeln | Nur verweisen, keine Spielberechtigung nachbauen; Entwicklung beobachten |
| Nur ein Pilotverein | Verzerrte Anforderungen | In M5 mindestens drei Vereine einbeziehen |
| Überschätzte Förderung | Planung hängt an Geld, das nicht kommt | Förderantrag erst nach Prüfung; Entwicklung nicht davon abhängig machen |

---

## 12. Anhang

### Quellen (Recherche vom 18.10.2026, teilweise Sekundärquellen)
- Handball360 als zentrale Plattform ab 2026/27, Antragsweg Verein/Spieler/Landesverband, verschobene Einführung in mehreren Landesverbänden: [Handball Westfalen, Passwesen Vereinsbereich 3.0](https://www.handballwestfalen.de/fileadmin/user_upload/2026-08-24-Passwesen_Vereinsbereich_3.0.pdf), [BWHV, Passwesen Vereinsbereich](https://www.bwhv.org/fileadmin/bwhv/news/2026/07_Juli/Passwesen_Vereinsbereich.pdf), [Volksstimme](https://www.volksstimme.de/sport/handball/riss-durch-deutschland-handball360-spaltet-die-basis-4311461), [ARAG-Ratgeber](https://www.arag.de/vereinsversicherung/handball-verein/).
- Vereinssoftware-Landschaft (nur Namen, keine belastbaren Preise): [Vergleiche easyVerein/SportMember](https://trusted.de/easyverein-vs-sportmember), [easyVerein-Alternativen](https://trusted.de/easyverein-alternativen?p=2).
- SEPA für Vereine (Gläubiger-ID, Mandatsreferenz, Vorabankündigung, Rückerstattungsfrist, Satzungsgrundlage; teils ältere Unterlagen, vor Umsetzung gegen aktuelle Regeln prüfen): [Haufe](https://www.haufe.de/id/beitrag/satzungs-update-2017-6-abwicklung-des-beitragswesens-unter-beruecksichtigung-des-sepa-verfahrens-HI6651636.html), [DLRG-Präsentation](https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Finanzen/SM-DLRG-SEPA-Vortrag_V3.4.pdf).

### Nicht gefunden / nicht geprüft
- Preise von Wettbewerbern, Funktionsumfang im Vergleich.
- Eine Schnittstelle von Handball360 oder nuLiga zu Mitgliederdaten.
- Rechtsgrundlagen zu Minderjährigen, Löschfristen und Mandaten Minderjähriger.
- Stichtage der Altersklassen in der Spielordnung des Hessischen Handball-Verbands.
- Format und Pflicht der Bestandserhebung beim Landessportbund Hessen.
- Ob und wie ein Verein heute produktiv Mitglieder in HandballerPate pflegt: keine Nutzungsdaten ausgewertet.

### Dokumente im Repo, die dieses Konzept ablöst oder einordnet
| Datei | Einordnung |
|---|---|
| `docs/umsetzungsplan-vereinsverwaltung.md` | Preismodell bleibt gültig; Phasenplan und Termine **überholt** durch Abschnitt 8 |
| `docs/claude-code-aufgabe-vereinsverwaltung.md`, `…-phase1.md`, `docs/claude-code-phase1-anweisung.md` | Auftragsdokumente für Phase 1–3, **umgesetzt**, nur noch Historie |
| `docs/foerderantrag-deinehrenamt.md` | Entwurf, Annahmen ungeprüft (Abschnitt 7) |
| `docs/plan-vereinfachung.md` | Unabhängig; Punkte bleiben offen, gehören aber hinter M1 |
