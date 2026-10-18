"use client";

// Letzter Fallback, wenn schon das Root-Layout fehlschlägt (error.tsx greift dort nicht). Bewusst ohne App-Komponenten und Styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2rem", maxWidth: "28rem" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Etwas ist schiefgelaufen</h1>
        <p>Die Seite konnte nicht geladen werden. Vielleicht wurde die App gerade aktualisiert.</p>
        <button onClick={() => window.location.reload()} style={{ padding: "0.6rem 1rem", marginRight: "0.5rem" }}>
          Seite neu laden
        </button>
        <button onClick={() => reset()} style={{ padding: "0.6rem 1rem" }}>
          Erneut versuchen
        </button>
      </body>
    </html>
  );
}
