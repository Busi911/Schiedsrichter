// Kurze Starthilfe in den Mails, wenn jemand eine Wart-Rolle oder die Rolle Trainer bekommt (Willkommens-Mail bei neuem Zugang UND
// Rollen-Info-Mail bei zusätzlicher Rolle). Rein (ohne DB), getestet in rollen-hinweise.test.ts; die Basis-URL kommt vom Aufrufer.
// Die Wart-Seiten zeigen oben die Karte "So legst du los" (lib/wart-onboarding.ts).

const WART_SEITEN: Record<string, { pfad: string; name: string }> = {
  schiedsrichterwart: { pfad: "/profil/schiedsrichterwart", name: "Schiedsrichterwart" },
  zeitnehmerwart: { pfad: "/profil/zeitnehmerwart", name: "Zeitnehmer-/Sekretärwart" },
  ordnerwart: { pfad: "/profil/ordnerwart", name: "Ordner-/Kioskdienst-/Kassiererwart" },
  dienstwart: { pfad: "/profil/dienstwart", name: "Dienstwart (eigene Dienste)" },
};

export type RollenHinweise = {
  zeilen: string[];
  // Direkt zur (ersten) Wart-Seite nach dem Login, sonst null
  cta: { text: string; url: string } | null;
};

export function rollenHinweise(typen: string[], basisUrl: string): RollenHinweise {
  const einzigartig = [...new Set(typen)];
  const warte = einzigartig.filter((t) => t in WART_SEITEN);
  const zeilen: string[] = [];
  for (const t of warte) {
    const w = WART_SEITEN[t];
    zeilen.push(
      `Als ${w.name} arbeitest du auf einer eigenen Seite: ${basisUrl}${w.pfad}. Ganz oben steht eine kurze Anleitung „So legst du los“ mit den ersten Schritten; die Haken setzen sich von selbst.`
    );
  }
  if (einzigartig.includes("trainer")) {
    zeilen.push(
      "Als Trainer siehst du im Profil die Heim- und Auswärtsspiele deiner Mannschaft, offene Dienste und deinen persönlichen Kalender (zum Abonnieren im Handy). Wird ein Spiel deiner Mannschaft verlegt, bekommst du automatisch eine Info-Mail. Unter „Training“ siehst du den Trainingsplan und meldest ein ausfallendes Training; fällt ein Training im Verein aus, erfährst du per Mail, dass die Halle frei ist (im Profil abschaltbar)."
    );
  }
  if (zeilen.length > 0) zeilen.push(`Hilfe zu allen Rollen (nach dem Login): ${basisUrl}/hilfe#rollen`);
  const erste = warte[0];
  return {
    zeilen,
    cta: erste
      ? { text: `Zur Seite „${WART_SEITEN[erste].name}“`, url: `${basisUrl}/login?redirect=${encodeURIComponent(WART_SEITEN[erste].pfad)}` }
      : null,
  };
}
