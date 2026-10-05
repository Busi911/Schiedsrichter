// Eigene Vereinsfarbe der öffentlichen Seite/Web-App. Gespeichert wird nur der FARBTON (0-359): Sättigung und
// Helligkeit der Seite sind festgelegt (lesbar in Hell und Dunkel, siehe FanTheme), damit jede Wahl gut aussieht.
// Rein (ohne DB), testbar.

const HEX = /^#?([0-9a-f]{6})$/i;

// Hex-Farbe -> Farbton 0-359. null bei Grau/Weiß/Schwarz (kein erkennbarer Farbton) oder ungültiger Eingabe.
export function hexZuFarbton(hex: string): number | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma < 0.12) return null;
  let h: number;
  if (max === r) h = ((g - b) / chroma + 6) % 6;
  else if (max === g) h = (b - r) / chroma + 2;
  else h = (r - g) / chroma + 4;
  return Math.round(h * 60) % 360;
}

// Farbton -> Hex in der Stärke, in der die Seite die Farbe verwendet (für die Anzeige im Farbwähler).
export function farbtonZuHex(farbton: number): string {
  const h = ((farbton % 360) + 360) % 360;
  const s = 0.55;
  const l = 0.28;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
