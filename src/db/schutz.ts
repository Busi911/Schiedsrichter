import "server-only";
import { mitColdStartRetry } from "./retry";

// Cold-Start-Schutz für eine drizzle-Instanz, damit auch Zugriffe ohne eigenen mitColdStartRetry-Aufruf
// (Seiten, Server Actions, Crons mit adminDb) einen aufwachenden Neon-Compute überstehen, statt mit einem
// Verbindungsfehler abzubrechen. Greift auf drizzle-Ebene (Builder werden beim Ausführen wiederholt),
// NICHT in den Pool-Interna (siehe Kommentar in db/index.ts).
//
// Wiederholt wird nur der Verbindungsfehler-Fall (siehe retry.ts):
// - Lesen (select, relationale Abfragen, execute): alle erkannten transienten Fehler,
// - Schreiben (insert/update/delete): nur Fehler, bei denen die Anweisung sicher noch nicht lief — damit
//   nie etwas doppelt geschrieben wird,
// - transaction(): wie withTenant als Ganzes, mit dem strengen (sicheren) Fehlersatz.

const LESEND = new Set(["select", "selectDistinct", "selectDistinctOn", "with"]);
const SCHREIBEND = new Set(["insert", "update", "delete"]);

type Ausfuehrbar = { execute: (...args: unknown[]) => Promise<unknown> };

const istAusfuehrbar = (x: unknown): x is Ausfuehrbar =>
  typeof x === "object" && x !== null && typeof (x as { execute?: unknown }).execute === "function";

// Umhüllt einen (lazy) Query-Builder: Methodenaufrufe laufen auf dem Original, das Ergebnis bleibt ein
// umhüllter Builder; beim Ausführen (await/then) wird mit Retry ausgeführt.
function umhuelleBuilder<T extends object>(builder: T, strikt: boolean): T {
  const proxy: T = new Proxy(builder, {
    get(ziel, name) {
      if (name === "then") {
        return (onErfuellt?: (w: unknown) => unknown, onAbgelehnt?: (e: unknown) => unknown) =>
          mitColdStartRetry(
            () => (istAusfuehrbar(ziel) ? ziel.execute() : Promise.resolve(ziel)),
            2,
            strikt
          ).then(onErfuellt, onAbgelehnt);
      }
      const wert = Reflect.get(ziel, name, ziel);
      if (typeof wert !== "function") return wert;
      return (...args: unknown[]) => {
        const ergebnis = (wert as (...a: unknown[]) => unknown).apply(ziel, args);
        if (ergebnis === ziel) return proxy;
        return istAusfuehrbar(ergebnis) ? umhuelleBuilder(ergebnis as object, strikt) : ergebnis;
      };
    },
  });
  return proxy;
}

// db.query.<tabelle>.findMany()/findFirst() (relationale Abfragen): lesend.
function umhuelleQuery<T extends object>(query: T): T {
  return new Proxy(query, {
    get(ziel, tabelle) {
      const wert = Reflect.get(ziel, tabelle, ziel);
      if (typeof wert !== "object" || wert === null) return wert;
      return new Proxy(wert, {
        get(tabellenZiel, methode) {
          const m = Reflect.get(tabellenZiel, methode, tabellenZiel);
          if (typeof m !== "function") return m;
          return (...args: unknown[]) => {
            const builder = (m as (...a: unknown[]) => unknown).apply(tabellenZiel, args);
            return istAusfuehrbar(builder) ? umhuelleBuilder(builder as object, false) : builder;
          };
        },
      });
    },
  });
}

export function mitColdStartSchutz<T extends object>(db: T): T {
  return new Proxy(db, {
    get(ziel, name) {
      const wert = Reflect.get(ziel, name, ziel);
      if (name === "query" && typeof wert === "object" && wert !== null) return umhuelleQuery(wert);
      if (typeof wert !== "function") return wert;
      const fn = wert as (...a: unknown[]) => unknown;
      if (name === "transaction") {
        return (...args: unknown[]) =>
          mitColdStartRetry(() => fn.apply(ziel, args) as Promise<unknown>, 2, true);
      }
      if (name === "execute") {
        return (...args: unknown[]) =>
          mitColdStartRetry(() => fn.apply(ziel, args) as Promise<unknown>, 2, false);
      }
      if (typeof name === "string" && (LESEND.has(name) || SCHREIBEND.has(name))) {
        const strikt = SCHREIBEND.has(name);
        return (...args: unknown[]) => {
          const builder = fn.apply(ziel, args);
          return istAusfuehrbar(builder) || typeof builder === "object"
            ? umhuelleBuilder(builder as object, strikt)
            : builder;
        };
      }
      return fn.bind(ziel);
    },
  });
}
