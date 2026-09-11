"use client";

// Kopfzeilen-Checkbox zum Massen-Auswählen aller Zeilen-Checkboxen mit
// demselben name innerhalb desselben Formulars (z.B. "alle Termine für den
// Export auswählen") — reines DOM-Umschalten statt React-State über
// potenziell hunderte Zeilen, da hier keine Auswahl-Anzeige o.ä. nötig ist,
// nur das native Formular-Submit soll am Ende die richtigen Werte tragen.
export function AlleAuswaehlenCheckbox({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-primary"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form
          ?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
          .forEach((cb) => {
            cb.checked = e.currentTarget.checked;
          });
      }}
    />
  );
}
