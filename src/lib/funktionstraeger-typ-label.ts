// Eigene Datei (statt in funktionstraeger-tabelle.tsx definiert), damit
// funktionstraeger-bearbeiten-dialog.tsx dies importieren kann, ohne einen
// zirkulären Import zu erzeugen (die Tabelle importiert umgekehrt das
// Bearbeiten-Modal) — siehe gleiches Prinzip bei lib/mannschaft-label.ts.
export const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienst-/Kassiererwart",
};
