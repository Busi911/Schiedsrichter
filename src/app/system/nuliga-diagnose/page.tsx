import { requireSystemAdmin } from "@/lib/session";
import { diagnoseNuligaBild, holeNuligaHtml } from "@/lib/nuliga/client";
import { findeHallen, parseVereinsInfo } from "@/lib/nuliga/parsers/vereinsinfo";
import { absoluteNuligaUrl, baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";

export const maxDuration = 60;

// Diagnose der nuLiga-Vereinsseite (Hallen, Logo): zeigt Schritt für Schritt, wo etwas scheitert — Parsing,
// URL-Aufbau, Download oder Bildtyp. Nur lesend, nur Systemadmin, schreibt nichts.
export default async function NuligaDiagnosePage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  await requireSystemAdmin();
  const { club = "" } = await searchParams;
  const clubId = /^\d{1,10}$/.test(club.trim()) ? club.trim() : null;

  let zeilen: [string, string][] = [];
  let fehler: string | null = null;
  if (clubId) {
    try {
      const url = baueNuligaUrl("HHV", "clubInfoDisplay", { club: clubId });
      const html = await holeNuligaHtml(url);
      const { daten, warnungen } = parseVereinsInfo(html);
      const hallen = findeHallen(html);
      zeilen = [
        ["Seite", url],
        ["clubId", clubId],
        ["clubName", daten.name ?? "—"],
        ["Hallenbereich gefunden", String(hallen.gefunden)],
        ["Rohtexte der Hallenlinks", hallen.rohtexte.length ? hallen.rohtexte.join(" | ") : "—"],
        ["Hallen (bereinigt)", daten.hallen.length ? JSON.stringify(daten.hallen) : "[]"],
        ["Logo-img gefunden", String(!!daten.logoPfad)],
        ["Logo src", daten.logoPfad ?? "—"],
        ["Logo sicher (alt-Text = Vereinsname)", String(daten.logoSicher)],
        ["Warnungen", warnungen.join(" | ") || "—"],
      ];
      if (daten.logoPfad) {
        const b = await diagnoseNuligaBild(absoluteNuligaUrl("HHV", daten.logoPfad));
        zeilen.push(
          ["Logo-URL (absolut)", b.url],
          ["HTTP-Status Logo", String(b.status ?? "—") + (b.location ? ` → ${b.location}` : "")],
          ["Content-Type", b.contentType ?? "—"],
          ["Dateigröße", b.bytes === null ? "—" : `${b.bytes} Byte`],
          ["Erkannter Bildtyp (Magic Bytes)", b.erkannterTyp ?? "keiner"],
          ["Fehler", b.fehler ?? "—"]
        );
      }
    } catch (err) {
      fehler = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">nuLiga-Diagnose</h1>
        <p className="text-sm text-muted-foreground">Prüft die Vereinsseite eines Vereins (Hallen, Logo). Schreibt nichts.</p>
      </div>
      <form className="flex max-w-md gap-2">
        <Input name="club" defaultValue={club || "76446"} inputMode="numeric" placeholder="club-ID, z.B. 76446" aria-label="club-ID" />
        <SubmitButton pendingText="Prüft…">Prüfen</SubmitButton>
      </form>
      {club && !clubId && <p className="text-sm text-red-700">Die club-ID besteht nur aus Ziffern.</p>}
      {fehler && <p className="text-sm text-red-700">Abruf fehlgeschlagen: {fehler}</p>}
      {zeilen.length > 0 && (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[16rem_1fr]">
          {zeilen.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-mono text-xs break-all">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
