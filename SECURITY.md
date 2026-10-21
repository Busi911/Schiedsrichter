# Security Policy

## Meldung von Sicherheitslücken

Bitte Sicherheitslücken **nicht** über ein öffentliches Issue melden.

Stattdessen über GitHub Security Advisories melden:
https://github.com/Busi911/Schiedsrichter/security/advisories/new

Das erlaubt eine private Abstimmung, bevor Details veröffentlicht werden.

## Umfang

Diese Anwendung verwaltet personenbezogene Daten (Funktionsträger, Vereine,
Termine). Relevant sind insbesondere:

- Authentifizierung/Autorisierung (Auth.js, Magic-Link-Login)
- Zugriff auf Vereins- und Personendaten über Rollen/Rechte hinweg
- Cron-Endpunkte unter `/api/cron/*` (durch `CRON_SECRET` geschützt)
- Abhängigkeiten mit bekannten CVEs (siehe Dependabot-Konfiguration)

## Abhängigkeits-Updates

Sicherheitsrelevante Abhängigkeits-Updates werden automatisiert über
Dependabot vorgeschlagen (siehe `.github/dependabot.yml`).
