@AGENTS.md

## E-Mail-Layout

Jede transaktionale Mail geht über `src/lib/email-layout.ts`
(`emailAlsText`/`emailAlsHtml`, Typ `EmailInhalt`) statt ein eigenes
HTML-Grundgerüst zu bauen — sonst driften Styling und Aufbau über die Zeit
auseinander (Inline-Styles + Tabellen-Layout, da die meisten Mail-Clients,
allen voran Outlook Desktop, `<style>`-Blöcke und Flexbox/Grid ignorieren).

Konvention für neue Mails: eine Funktion, die ein `EmailInhalt`-Objekt
zurückgibt (Inhalt EINMAL beschrieben, nicht in Text- und Html-Version
separat gepflegt), z.B.:

```ts
function xInhalt(...): EmailInhalt {
  return {
    vereinName, // weglassen bei Mails ohne Vereins-Kontext (z.B. Login-Link)
    ueberschrift: "...",
    zeilen: ["...", "..."],
    cta: { text: "...", url: "..." }, // optional
    kleingedrucktes: "...", // optional, unaufdringlicher Hinweis unten
  };
}
```

Beim Versenden dann `sendMail(to, subject, emailAlsText(inhalt), emailAlsHtml(inhalt))`.

`login-mail.ts` und `termin-mail.ts` sind ältere, noch bestehende
Text/Html-Funktionspaare, die intern auf `email-layout.ts` delegieren —
neue Mails brauchen kein eigenes Paar mehr, sondern nutzen das
`EmailInhalt`-Muster direkt.
