import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import {
  ligaGruppen,
  ligaMannschaften,
  ligaSpiele,
  ligaTeilnahmen,
  ligaVereine,
  termine,
  terminZuordnungen,
  vereine,
} from "@/db/schema";
import {
  gleicheAb,
  istEigeneHalle,
  kategorieText,
  parseHallenNamen,
  ortWeichtAb,
  vergleicheVerknuepftes,
  type AbgleichErgebnis,
} from "@/lib/hallenplan-abgleich";

const berlinUhr = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Trockenlauf der Zusammenführung: nur eine Vorschau, was passieren WÜRDE.
export type Trockenlauf = {
  // Sicher zugeordnete Termine (würden mit dem öffentlichen Spiel verknüpft).
  verknuepfbar: number;
  // Davon noch NICHT verknüpft (nur dafür ist der Knopf "verknüpfen" nötig).
  verknuepfbarOffen: number;
  // Davon mit eingetragenen Funktionsträgern (Zuordnungen bleiben erhalten).
  verknuepfbarMitZuordnungen: number;
  // Davon mit Ansetzung aus dem Hallenplan (Schiedsrichter-Kürzel bzw. von
  // handball.net gemeldete Schiedsrichter/Zeitnehmer) — sie liegt nur im
  // privaten Termin und muss bei der Zusammenführung erhalten bleiben.
  verknuepfbarMitAnsetzung: number;
  // Ort (Hallenname) weicht ab — häufigste Paare Hallenplan → öffentlich. Der
  // bisherige Import wertet einen anderen Ort als Verlegung (Zuordnungen weg,
  // Mails), deshalb darf die Zusammenführung den Ort nicht überschreiben.
  ortAbweichungen: number;
  // Davon nur Termine ab jetzt (vergangene Termine sind für den Handlungsbedarf unerheblich).
  ortAbweichungenKuenftig: number;
  ortBeispiele: { hallenplan: string; oeffentlich: string; anzahl: number }[];
  // Offene (noch nicht bestätigte) künftige Ort-Abweichungen einzeln, zum Prüfen und Bestätigen.
  ortFaelle: { terminId: string; start: Date; heim: string | null; gast: string | null; hallenplan: string; oeffentlich: string }[];
  // Bereits bestätigte Abweichungen (zählen nicht mehr als offen).
  ortBestaetigt: number;
  // Öffentliche Zeit weicht vom Hallenplan ab (Verlegung?) — würde den Termin
  // verschieben (und Zuordnungen außer Schiri entfernen, siehe rundenspiel-sync.ts).
  zeitAbweichungen: {
    start: Date;
    heim: string | null;
    gast: string | null;
    neu: string;
    zuordnungen: number;
  }[];
  // Ergebnis kommt aus den öffentlichen Daten dazu.
  ergebnisNeu: number;
  // Heimspiele in eigener Halle ohne Termin: würden neu angelegt.
  neuAnzulegen: { datum: string; uhrzeit: string | null; heim: string; gast: string; halle: string | null }[];
  neuAnzulegenGesamt: number;
  // Heimspiele ohne Termin, die schon vorbei sind: werden nicht übernommen.
  neuVergangen: number;
  // Nicht sicher zugeordnete Termine, die unberührt blieben (davon mit Zuordnungen).
  unberuehrt: number;
  // Ampel: Liga-Pflichtspiel-Termine (haben ein öffentliches Gegenstück) und
  // wie viele davon sicher zugeordnet sind. Freundschaftsspiele/Turniere haben
  // keins und sind erwartbar offen.
  pflichtGesamt: number;
  pflichtOffen: number;
  // Davon nur Termine ab jetzt: Spiele der Vorsaison werden nie zuordenbar und würden den
  // Handlungsbedarf dauerhaft offen lassen.
  pflichtOffenKuenftig: number;
  freundschaftGesamt: number;
  unberuehrtMitZuordnungen: number;
};

export type VereinsAbgleich = {
  vereinId: string;
  vereinName: string;
  hatLigaVerein: boolean;
  // Liga-Sync-Cron legt fehlende künftige Heimspiele selbst an.
  uebernahmeAktiv: boolean;
  termineGesamt: number;
  // Termine, die bereits mit einem öffentlichen Spiel verknüpft sind.
  bereitsVerknuepft: number;
  // Die verknüpften Termine (Hallenplan ↔ öffentliches Spiel), nach Datum.
  verknuepfte: {
    start: Date;
    heim: string | null;
    gast: string | null;
    spiel: string | null; // null = Spiel nicht (mehr) in den Daten dieses Vereins
    zuordnungen: number;
    ansetzung: boolean;
    ortAbweichung: boolean;
  }[];
  anzahl: Record<AbgleichErgebnis["status"], number>;
  // Liga-Spiele eigener Mannschaften ohne Hallenplan-Termin. Auswärtsspiele
  // stehen naturgemäß nie im eigenen Hallenplan und sind unproblematisch.
  nurOeffentlichHeim: number;
  // davon: Heimspiele, deren Halle zu den eigenen Hallen-IDs gehört (nur die
  // brauchen eine Einteilung) bzw. in anderen/unbekannten Hallen (z.B. die
  // Partnerhalle einer Spielgemeinschaft).
  nurOeffentlichHeimEigeneHalle: number;
  nurOeffentlichHeimAndereHalle: number;
  nurOeffentlichHeimHalleUnbekannt: number;
  // Hallen der Heimspiele, die nicht zu den eigenen gehören (häufigste zuerst).
  andereHallenNamen: { name: string; anzahl: number }[];
  nurOeffentlichAuswaerts: number;
  // Kein Treffer, davon Freundschaftsspiele/Turniere (ohne Spielnummer, nicht in der Liga).
  keinTrefferFreundschaft: number;
  trockenlauf: Trockenlauf;
  auffaellig: {
    status: AbgleichErgebnis["status"];
    start: Date;
    heim: string | null;
    gast: string | null;
    uid: string | null;
    pflichtspiel: boolean | null;
    kandidaten: string[];
  }[];
};

type VereinsZeile = {
  id: string;
  name: string;
  halle1: string | null;
  halle2: string | null;
  halle3: string | null;
  hallenNamen: string | null;
  uebernahmeAktiv: boolean;
};

const alleVereinsZeilen = (): Promise<VereinsZeile[]> =>
  adminDb
    .select({
      id: vereine.id,
      name: vereine.name,
      halle1: vereine.nuligaHalle1Id,
      halle2: vereine.nuligaHalle2Id,
      halle3: vereine.nuligaHalle3Id,
      hallenNamen: vereine.eigeneHallenNamen,
      uebernahmeAktiv: vereine.ligaUebernahmeAktiv,
    })
    .from(vereine);

// Rechnet den Abgleich für EINEN Verein (nur lesend). `sichere` sind die
// sicher zugeordneten Paare Termin -> öffentliches Spiel (Basis der Verknüpfung).
async function berechneFuerVerein(
  v: VereinsZeile
): Promise<{
  bericht: VereinsAbgleich;
  sichere: { terminId: string; spielId: string }[];
  neuSpiele: { spiel: typeof ligaSpiele.$inferSelect; kategorie: string | null }[];
}> {
  const hallenTermine = await adminDb
    .select({
      id: termine.id,
      start: termine.start,
      ort: termine.ort,
      icsUid: termine.icsUid,
      heim: termine.heimMannschaftName,
      gast: termine.auswaertsMannschaftName,
      kategorie: termine.kategorie,
      pflichtspiel: termine.pflichtspiel,
      ergebnisHeim: termine.ergebnisHeim,
      ergebnisAuswaerts: termine.ergebnisAuswaerts,
      srKuerzel: termine.nuligaSchiedsrichterKuerzel,
      hnSchiedsrichter: termine.handballNetSchiedsrichter,
      hnZeitnehmer: termine.handballNetZeitnehmer,
      ligaSpielId: termine.ligaSpielId,
      ortBestaetigt: termine.ligaOrtBestaetigt,
    })
    .from(termine)
    .where(and(eq(termine.vereinId, v.id), eq(termine.typ, "rundenspiel")));

  const zuordnungsAnzahl = new Map<string, number>();
  if (hallenTermine.length > 0) {
    const zeilen = await adminDb
      .select({ terminId: terminZuordnungen.terminId, anzahl: sql<number>`count(*)::int` })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, hallenTermine.map((t) => t.id)))
      .groupBy(terminZuordnungen.terminId);
    for (const z of zeilen) zuordnungsAnzahl.set(z.terminId, z.anzahl);
  }

  const [ligaVerein] = await adminDb
    .select({ id: ligaVereine.id })
    .from(ligaVereine)
    .where(eq(ligaVereine.vereinId, v.id));

  let spiele: (typeof ligaSpiele.$inferSelect)[] = [];
  let eigeneTeamIds = new Set<string>();
  if (ligaVerein) {
    const teilnahmen = await adminDb
      .select({ gruppeId: ligaTeilnahmen.gruppeId, teamtable: ligaTeilnahmen.nuligaTeamtableId })
      .from(ligaTeilnahmen)
      .innerJoin(ligaMannschaften, eq(ligaTeilnahmen.mannschaftId, ligaMannschaften.id))
      .where(and(eq(ligaMannschaften.ligaVereinId, ligaVerein.id), eq(ligaTeilnahmen.aktiv, true)));
    const gruppen = [...new Set(teilnahmen.map((t) => t.gruppeId))];
    const teamIds = teilnahmen.map((t) => t.teamtable).filter((x): x is string => !!x);
    eigeneTeamIds = new Set(teamIds);
    if (gruppen.length > 0 && teamIds.length > 0) {
      spiele = await adminDb
        .select()
        .from(ligaSpiele)
        .where(
          and(
            inArray(ligaSpiele.gruppeId, gruppen),
            or(inArray(ligaSpiele.heimTeamtableId, teamIds), inArray(ligaSpiele.gastTeamtableId, teamIds))
          )
        );
    }
  }

  const gruppenInfo = new Map(
    (spiele.length
      ? await adminDb
          .select({ id: ligaGruppen.id, geschlecht: ligaGruppen.geschlecht, altersklasse: ligaGruppen.altersklasse })
          .from(ligaGruppen)
          .where(inArray(ligaGruppen.id, [...new Set(spiele.map((s) => s.gruppeId))]))
      : []
    ).map((g) => [g.id, g])
  );

  const abgleich = gleicheAb(
    hallenTermine,
    spiele.map((s) => ({
      id: s.id,
      spielnummer: s.spielnummer,
      datum: s.datum,
      uhrzeit: s.uhrzeit ?? (s.beginn ? berlinUhr.format(s.beginn) : null),
      geschlecht: gruppenInfo.get(s.gruppeId)?.geschlecht ?? null,
      altersklasse: gruppenInfo.get(s.gruppeId)?.altersklasse ?? null,
      heimName: s.heimName,
      gastName: s.gastName,
    }))
  );
  const anzahl = { sicher: 0, unklar: 0, mehrdeutig: 0, kein_treffer: 0 };
  for (const a of abgleich) anzahl[a.status]++;
  const verknuepft = new Set(abgleich.flatMap((a) => (a.status === "sicher" ? a.spielIds : [])));
  const unverknuepft = spiele.filter((s) => !verknuepft.has(s.id));
  const heimUnverknuepft = unverknuepft.filter(
    (s) => s.heimTeamtableId && eigeneTeamIds.has(s.heimTeamtableId)
  );
  const eigene = {
    ids: [v.halle1, v.halle2, v.halle3].filter((h): h is string => !!h),
    namen: parseHallenNamen(v.hallenNamen),
  };
  const heimEigeneHalle = heimUnverknuepft.filter((s) => istEigeneHalle(s, eigene)).length;
  const heimHalleUnbekannt = heimUnverknuepft.filter((s) => !s.halleNuligaId && !s.halleName).length;
  const andereHallen = new Map<string, number>();
  for (const s of heimUnverknuepft) {
    if (istEigeneHalle(s, eigene) || !s.halleName) continue;
    andereHallen.set(s.halleName, (andereHallen.get(s.halleName) ?? 0) + 1);
  }
  const nurOeffentlichHeim = heimUnverknuepft.length;

  const nachId = new Map(hallenTermine.map((t) => [t.id, t]));
  const spielNachId = new Map(spiele.map((s) => [s.id, s]));
  const auffaellig = abgleich
    .filter((a) => a.status !== "sicher")
    .map((a) => {
      const t = nachId.get(a.terminId)!;
      return {
        status: a.status,
        start: t.start,
        heim: t.heim,
        gast: t.gast,
        uid: t.icsUid,
        pflichtspiel: t.pflichtspiel,
        kandidaten: a.spielIds.map((id) => {
          const s = spielNachId.get(id)!;
          return `${s.datum} ${s.heimName} – ${s.gastName}${s.spielnummer ? ` (Nr. ${s.spielnummer})` : ""}`;
        }),
      };
    })
    // Pflichtspiele zuerst (die sind prüfenswert), Freundschaften/Turniere danach.
    .sort(
      (x, y) =>
        Number(x.pflichtspiel === false) - Number(y.pflichtspiel === false) ||
        x.start.getTime() - y.start.getTime()
    );

  const sicherePaare = abgleich
    .filter((a) => a.status === "sicher")
    .map((a) => ({ termin: nachId.get(a.terminId)!, spiel: spielNachId.get(a.spielIds[0])! }));
  const zeitAbweichungen: Trockenlauf["zeitAbweichungen"] = [];
  let ergebnisNeu = 0;
  for (const { termin, spiel } of sicherePaare) {
    const diff = vergleicheVerknuepftes(termin, spiel);
    if (diff.ergebnisNeu) ergebnisNeu++;
    if (diff.zeitAbweichung) {
      zeitAbweichungen.push({
        start: termin.start,
        heim: termin.heim,
        gast: termin.gast,
        neu: `${spiel.datum}${spiel.uhrzeit ? ` ${spiel.uhrzeit}` : ""}`,
        zuordnungen: zuordnungsAnzahl.get(termin.id) ?? 0,
      });
    }
  }
  let ortAbweichungen = 0;
  let ortAbweichungenKuenftig = 0;
  let ortBestaetigt = 0;
  const ortFaelle: Trockenlauf["ortFaelle"] = [];
  const jetztZeit = Date.now();
  const ortPaare = new Map<string, { hallenplan: string; oeffentlich: string; anzahl: number }>();
  for (const { termin, spiel } of sicherePaare) {
    if (!ortWeichtAb(termin.ort, spiel.halleName)) continue;
    if (termin.ortBestaetigt && termin.ortBestaetigt === spiel.halleName) {
      ortBestaetigt++;
      continue;
    }
    ortAbweichungen++;
    if (termin.start.getTime() >= jetztZeit) {
      ortAbweichungenKuenftig++;
      ortFaelle.push({
        terminId: termin.id,
        start: termin.start,
        heim: termin.heim,
        gast: termin.gast,
        hallenplan: termin.ort ?? "—",
        oeffentlich: spiel.halleName ?? "—",
      });
    }
    const schluessel = `${termin.ort}|${spiel.halleName}`;
    const e = ortPaare.get(schluessel) ?? {
      hallenplan: termin.ort ?? "—",
      oeffentlich: spiel.halleName ?? "—",
      anzahl: 0,
    };
    e.anzahl++;
    ortPaare.set(schluessel, e);
  }
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const neuOhneTermin = heimUnverknuepft
    .filter((s) => istEigeneHalle(s, eigene))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit ?? "").localeCompare(b.uhrzeit ?? ""));
  const neuAnzulegenAlle = neuOhneTermin.filter((sp) => sp.datum >= heute);
  const unberuehrteTermine = abgleich.filter((a) => a.status !== "sicher");
  const trockenlauf: Trockenlauf = {
    verknuepfbar: sicherePaare.length,
    verknuepfbarOffen: sicherePaare.filter((p) => !p.termin.ligaSpielId).length,
    verknuepfbarMitZuordnungen: sicherePaare.filter((p) => (zuordnungsAnzahl.get(p.termin.id) ?? 0) > 0).length,
    verknuepfbarMitAnsetzung: sicherePaare.filter(
      (p) => p.termin.srKuerzel || p.termin.hnSchiedsrichter || p.termin.hnZeitnehmer
    ).length,
    zeitAbweichungen: zeitAbweichungen.sort((a, b) => a.start.getTime() - b.start.getTime()),
    ergebnisNeu,
    ortAbweichungen,
    ortAbweichungenKuenftig,
    ortFaelle: ortFaelle.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 10),
    ortBestaetigt,
    ortBeispiele: [...ortPaare.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, 5),
    neuAnzulegen: neuAnzulegenAlle.slice(0, 30).map((s) => ({
      datum: s.datum,
      uhrzeit: s.uhrzeit ?? (s.beginn ? berlinUhr.format(s.beginn) : null),
      heim: s.heimName,
      gast: s.gastName,
      halle: s.halleName,
    })),
    neuAnzulegenGesamt: neuAnzulegenAlle.length,
    neuVergangen: neuOhneTermin.length - neuAnzulegenAlle.length,
    pflichtGesamt: hallenTermine.filter((t) => t.pflichtspiel !== false).length,
    pflichtOffen: abgleich.filter(
      (a) => a.status !== "sicher" && nachId.get(a.terminId)!.pflichtspiel !== false
    ).length,
    pflichtOffenKuenftig: abgleich.filter(
      (a) =>
        a.status !== "sicher" &&
        nachId.get(a.terminId)!.pflichtspiel !== false &&
        nachId.get(a.terminId)!.start.getTime() >= jetztZeit
    ).length,
    freundschaftGesamt: hallenTermine.filter((t) => t.pflichtspiel === false).length,
    unberuehrt: unberuehrteTermine.length,
    unberuehrtMitZuordnungen: unberuehrteTermine.filter((a) => (zuordnungsAnzahl.get(a.terminId) ?? 0) > 0).length,
  };

  const bericht: VereinsAbgleich = {
    vereinId: v.id,
    vereinName: v.name,
    hatLigaVerein: !!ligaVerein,
    uebernahmeAktiv: v.uebernahmeAktiv,
    termineGesamt: hallenTermine.length,
    bereitsVerknuepft: hallenTermine.filter((t) => t.ligaSpielId).length,
    verknuepfte: hallenTermine
      .filter((t) => t.ligaSpielId)
      .map((t) => {
        const sp = spielNachId.get(t.ligaSpielId!);
        return {
          start: t.start,
          heim: t.heim,
          gast: t.gast,
          spiel: sp
            ? `${sp.spielnummer ? `Nr. ${sp.spielnummer} · ` : ""}${sp.datum}${sp.uhrzeit ? ` ${sp.uhrzeit}` : ""}${
                sp.halleName ? ` · ${sp.halleName}` : ""
              }`
            : null,
          zuordnungen: zuordnungsAnzahl.get(t.id) ?? 0,
          ansetzung: !!(t.srKuerzel || t.hnSchiedsrichter || t.hnZeitnehmer),
          ortAbweichung: sp ? ortWeichtAb(t.ort, sp.halleName) : false,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    anzahl,
    nurOeffentlichHeim,
    nurOeffentlichHeimEigeneHalle: heimEigeneHalle,
    nurOeffentlichHeimAndereHalle: nurOeffentlichHeim - heimEigeneHalle - heimHalleUnbekannt,
    nurOeffentlichHeimHalleUnbekannt: heimHalleUnbekannt,
    andereHallenNamen: [...andereHallen]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, anzahl]) => ({ name, anzahl })),
    nurOeffentlichAuswaerts: unverknuepft.length - nurOeffentlichHeim,
    keinTrefferFreundschaft: abgleich.filter(
      (a) => a.status === "kein_treffer" && nachId.get(a.terminId)!.pflichtspiel === false
    ).length,
    trockenlauf,
    auffaellig,
};
  return {
    bericht,
    sichere: sicherePaare.map((p) => ({ terminId: p.termin.id, spielId: p.spiel.id })),
    neuSpiele: neuOhneTermin.map((spiel) => {
      const g = gruppenInfo.get(spiel.gruppeId);
      return { spiel, kategorie: kategorieText(g?.geschlecht ?? null, g?.altersklasse ?? null) };
    }),
  };
}

// Nur lesend (adminDb, vereinsübergreifend für den Systemadmin): verändert
// weder Termine noch Zuordnungen. Zeigt, wie viele Hallenplan-Termine sich
// sicher einem Spiel der öffentlichen Liga-Daten zuordnen lassen.
export async function berechneHallenplanAbgleich(): Promise<VereinsAbgleich[]> {
  const ergebnis: VereinsAbgleich[] = [];
  for (const v of await alleVereinsZeilen()) ergebnis.push((await berechneFuerVerein(v)).bericht);
  return ergebnis;
}

// Sicher zugeordnete Paare eines Vereins (für die Verknüpfung, siehe
// lib/hallenplan-verknuepfung.ts).
export async function ermittleSichereVerknuepfungen(vereinId: string) {
  const v = (await alleVereinsZeilen()).find((z) => z.id === vereinId);
  if (!v) throw new Error("Verein nicht gefunden.");
  return (await berechneFuerVerein(v)).sichere;
}

// Für die Übernahme (lib/liga-uebernahme.ts): Heimspiele in eigener Halle ohne
// Termin samt Kategorie, dazu die sicher zugeordneten Paare.
export async function ermittleUebernahmeBasis(vereinId: string) {
  const v = (await alleVereinsZeilen()).find((z) => z.id === vereinId);
  if (!v) throw new Error("Verein nicht gefunden.");
  const { sichere, neuSpiele } = await berechneFuerVerein(v);
  return { sichere, neuSpiele };
}
