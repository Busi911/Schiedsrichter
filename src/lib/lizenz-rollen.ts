// Eigene, "server-only"-freie Datei (anders als lizenz-erinnerung.ts), damit
// auch Client-Komponenten (z.B. funktionstraeger-tabelle.tsx) diese Liste
// nutzen können, um das Lizenz-Ablaufdatum-Feld nur bei den passenden
// Rollen einzublenden.
export const LIZENZ_ROLLEN = ["schiedsrichter", "zeitnehmer", "sekretaer"] as const;
export type LizenzRolle = (typeof LIZENZ_ROLLEN)[number];
