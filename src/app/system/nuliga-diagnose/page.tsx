import { requireSystemAdmin } from "@/lib/session";
import { BROWSER_UA, diagnoseNuligaBild, diagnoseNuligaSeite, type BildDiagnose } from "@/lib/nuliga/client";
import { bereinigeHallenname, findeHallen, parseVereinsInfo } from "@/lib/nuliga/parsers/vereinsinfo";
import { absoluteNuligaUrl, baueNuligaUrl } from "@/lib/nuliga/verbaende";
import { maskierePersonendaten } from "@/lib/bildtyp";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";

export const maxDuration = 60;

// Diagnose der nuLiga-Vereinsseite (Stammdaten, Hallen, Logo): zeigt Schritt für Schritt, wo etwas scheitert — Abruf,
// Parsing, URL-Aufbau, Weiterleitungen, Cookies, Download oder Bildtyp. Nur lesend, nur Systemadmin, schreibt nichts.
// Auszüge sind maskiert (E-Mail/Telefon), enthalten aber die öffentliche Seitenstruktur — vor dem Weitergeben ansehen.

function Zeile({ ok, label, children }: { ok: boolean | null; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          ok === null ? "bg-slate-500" : ok ? "bg-emerald-700" : "bg-red-700"
        }`}
        aria-label={ok === null ? "Hinweis" : ok ? "ok" : "fehlt"}
      >
        {ok === null ? "i" : ok ? "✓" : "✕"}
      </span>
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {children && <span className="break-words text-muted-foreground"> {children}</span>}
      </span>
    </li>
  );
}

const Mono = ({ children }: { children: React.ReactNode }) => <code className="font-mono text-xs break-all">{children}</code>;

function auszug(html: string, muster: RegExp, vor = 150, nach = 450): string | null {
  const m = muster.exec(html);
  if (!m) return null;
  return maskierePersonendaten(html.slice(Math.max(0, m.index - vor), m.index + nach));
}

function BildBlock({ b }: { b: BildDiagnose }) {
  const istBild = !!b.format && b.format.startsWith("image/") && !b.format.includes("svg");
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-medium">{b.variante}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        <Zeile ok={b.kette.length > 0} label="Weiterleitungskette">
          {b.kette.length === 0 ? "—" : b.kette.map((k) => `${k.status}${k.location ? ` → ${k.location}` : ""}`).join(" | ")}
        </Zeile>
        <Zeile ok={null} label="Finale URL"><Mono>{b.finalUrl ?? "—"}</Mono> (Host {b.finalerHost ?? "—"})</Zeile>
        <Zeile ok={b.status === 200} label={`HTTP ${b.status ?? "—"}`} />
        <Zeile ok={null} label="Content-Type">{b.contentType ?? "—"}</Zeile>
        <Zeile ok={null} label="Content-Length (Header)">{b.contentLength ?? "—"}</Zeile>
        <Zeile ok={null} label="Bytes (geladen)">{b.bytes ?? "—"}</Zeile>
        <Zeile ok={istBild} label="Erkanntes Format">{b.format ?? "—"}</Zeile>
        <Zeile ok={null} label="Erste 32 Bytes (hex)"><Mono>{b.hex32 ?? "—"}</Mono></Zeile>
        {b.htmlTitel && <Zeile ok={false} label="HTML-Titel der Antwort">{b.htmlTitel}</Zeile>}
        {b.textVorschau && <Zeile ok={false} label="Erste Zeichen als Text (kein Bild)"><Mono>{b.textVorschau}</Mono></Zeile>}
        {b.fehler && <Zeile ok={false} label="Fehler">{b.fehler}</Zeile>}
      </ul>
    </div>
  );
}

export default async function NuligaDiagnosePage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  await requireSystemAdmin();
  const { club = "" } = await searchParams;
  const clubId = /^\d{1,10}$/.test(club.trim()) ? club.trim() : null;

  const seitenUrl = clubId ? baueNuligaUrl("HHV", "clubInfoDisplay", { club: clubId }) : null;
  const seite = seitenUrl ? await diagnoseNuligaSeite(seitenUrl) : null;
  const geparst = seite && seite.html ? parseVereinsInfo(seite.html) : null;
  const hallen = seite && seite.html ? findeHallen(seite.html) : null;
  const info = geparst?.daten ?? null;

  // Logo: vier Abrufe zum Eingrenzen — A ohne alles, C nur Cookies, D Cookies + Referer (= echter Import), B wie ein Browser.
  const logoUrl = info?.logoPfad ? absoluteNuligaUrl("HHV", info.logoPfad) : null;
  const bilder: BildDiagnose[] = [];
  if (logoUrl && seite) {
    bilder.push(await diagnoseNuligaBild(logoUrl, "A) wie der echte Download (ohne Cookies, ohne Referer)"));
    const referer = seite.finalUrl ?? seite.url;
    bilder.push(await diagnoseNuligaBild(logoUrl, "C) ehrlicher User-Agent + nur Cookies der Vereinsseite", { cookie: seite.cookieHeader }));
    bilder.push(await diagnoseNuligaBild(logoUrl, "D) ehrlicher User-Agent + Cookies + Referer = so lädt der echte Import jetzt", { cookie: seite.cookieHeader, referer }));
    bilder.push(await diagnoseNuligaBild(logoUrl, "B) wie ein Browser (Browser-User-Agent, Referer, Cookies) — nur zum Vergleich", { browserHeader: true, referer, cookie: seite.cookieHeader }));
  }

  const imgTags = seite?.html ? [...seite.html.matchAll(/<img\b[^>]*>/gi)].map((m) => maskierePersonendaten(m[0])).slice(0, 25) : [];
  const auszuege: [string, string | null][] = seite?.html
    ? [
        ['um „Hallen“', auszug(seite.html, />\s*(?:hallen|spielst(?:ä|ae|&auml;)tten)\s*:?\s*</i)],
        ['um „VNr“', auszug(seite.html, /vnr|vereinsnummer|vereins-nr/i)],
        ['um „Gründung“', auszug(seite.html, /gr(?:ü|ue|&uuml;)ndung/i)],
        ['um „Website / www“', auszug(seite.html, /homepage|website|www\./i)],
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">nuLiga-Diagnose</h1>
        <p className="text-sm text-muted-foreground">Prüft die Vereinsseite eines Vereins (Stammdaten, Hallen, Logo). Schreibt nichts.</p>
      </div>
      <form className="flex max-w-md gap-2">
        <Input name="club" defaultValue={club || "54040"} inputMode="numeric" placeholder="club-ID, z.B. 54040 oder 76446" aria-label="club-ID" />
        <SubmitButton pendingText="Prüft…">Prüfen</SubmitButton>
      </form>
      {club && !clubId && <p className="text-sm text-red-700">Die club-ID besteht nur aus Ziffern.</p>}

      {seite && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-semibold">Club Page</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              <Zeile ok={seite.status === 200} label={`HTTP ${seite.status ?? "—"}`}>{seite.fehler ?? ""}</Zeile>
              <Zeile ok={null} label="URL"><Mono>{seite.url}</Mono></Zeile>
              <Zeile ok={null} label="Finale URL">
                <Mono>{seite.finalUrl ?? "—"}</Mono> {seite.weitergeleitet ? "(weitergeleitet)" : ""}
              </Zeile>
              <Zeile ok={null} label="Content-Type">{seite.contentType ?? "—"}</Zeile>
              <Zeile ok={null} label="Seitentitel">{seite.titel ?? "—"}</Zeile>
              <Zeile ok={null} label="Set-Cookie (nur Namen)">{seite.cookieNamen.length ? seite.cookieNamen.join(", ") : "keine"}</Zeile>
            </ul>
          </section>

          {info && (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="font-heading text-base font-semibold">Stammdaten</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  <Zeile ok={!!info.name} label="Name">{info.name ?? "nicht erkannt"}</Zeile>
                  <Zeile ok={!!info.nummer} label="VNr.">{info.nummer ?? "nicht erkannt"}</Zeile>
                  <Zeile ok={!!info.gruendung} label="Gründungsjahr">{info.gruendung ?? "nicht erkannt"}</Zeile>
                  <Zeile ok={!!info.website} label="Website">{info.website ?? "nicht erkannt"}</Zeile>
                  <Zeile ok={null} label="Warnungen">{geparst?.warnungen.join(" | ") || "—"}</Zeile>
                </ul>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="font-heading text-base font-semibold">Hallen</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  <Zeile ok={!!hallen?.gefunden} label={`Bereich „Hallen“ ${hallen?.gefunden ? "gefunden" : "nicht gefunden"}`} />
                  {hallen?.rohtexte.length ? (
                    hallen.rohtexte.map((roh) => {
                      const h = bereinigeHallenname(roh);
                      return (
                        <Zeile key={roh} ok label={h.name}>
                          raw: {roh} · Nummer: {h.nummer ?? "—"} · source: club-page
                        </Zeile>
                      );
                    })
                  ) : (
                    <Zeile ok={false} label="Keine Hallenlinks erkannt" />
                  )}
                </ul>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="font-heading text-base font-semibold">Logo</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  <Zeile ok={!!info.logoPfad} label="img gefunden">{info.logoPfad ? `src: ${info.logoPfad}` : "kein passendes Bild erkannt"}</Zeile>
                  <Zeile ok={info.logoPfad ? info.logoSicher : null} label="Zuordnung">{info.logoSicher ? "alt-Text = Vereinsname" : "nicht über den Namen abgesichert"}</Zeile>
                  <Zeile ok={null} label="Aufgelöste URL"><Mono>{logoUrl ?? "—"}</Mono></Zeile>
                </ul>
                {bilder.map((b) => (
                  <BildBlock key={b.variante} b={b} />
                ))}
                <p className="text-xs text-muted-foreground">B nutzt den Browser-User-Agent „{BROWSER_UA.slice(0, 40)}…“ nur zum Vergleich in dieser Diagnose, nicht beim echten Import.</p>
              </section>
            </>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-semibold">Rohdaten der Seite (maskiert)</h2>
            <p className="text-xs text-muted-foreground">E-Mail-Adressen und Telefonnummern sind ersetzt. Die Seite kann trotzdem Namen enthalten — vor dem Weitergeben ansehen.</p>
            {auszuege.map(([titel, text]) => (
              <details key={titel} className="rounded-lg border px-3 py-2" open={!!text}>
                <summary className="cursor-pointer text-sm">Auszug {titel} {text ? "" : "(nicht gefunden)"}</summary>
                {text && <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap">{text}</pre>}
              </details>
            ))}
            <details className="rounded-lg border px-3 py-2" open>
              <summary className="cursor-pointer text-sm">Alle &lt;img&gt;-Tags der Seite ({imgTags.length})</summary>
              <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap">{imgTags.join("\n") || "keine"}</pre>
            </details>
            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm">Seitenquelltext (erste 20.000 Zeichen, zum Kopieren)</summary>
              <textarea readOnly rows={20} className="mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs" value={maskierePersonendaten(seite.html).slice(0, 20000)} />
            </details>
          </section>
        </>
      )}
    </div>
  );
}
