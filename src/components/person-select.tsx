"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

// Wie LabeledSelectOption (siehe labeled-select.tsx), aber für Listen, bei
// denen Tippen schneller ist als Scrollen (z.B. "Person wählen…" in großen
// Vereinen) — deshalb eine durchsuchbare Combobox statt eines nativen
// Selects. Eigene, kleine Komponente statt LabeledSelect um Suche erweitert:
// LabeledSelect steht an vielen unkritischen Stellen (Mannschaft, Rolle, ...)
// mit kurzen Listen im Einsatz, wo eine Such-Eingabe nur zusätzliche
// Komplexität wäre.
export type PersonSelectOption = {
  value: string;
  label: string;
  group?: string;
  // Sichtbar, aber nicht auswählbar (ausgegraut) — z.B. eine Person, die für
  // diesen Termin/diese Rolle bereits eingetragen ist, oder deren Rolle
  // aktuell deaktiviert ist (siehe hinweis). Bewusst weiterhin in der Liste
  // statt sie herauszufiltern: sonst verschwindet ein Name kommentarlos, was
  // eher wie ein Fehler aussieht als eine bewusste Einschränkung.
  disabled?: boolean;
  // Kurzer Grund neben einer ausgegrauten Option, z.B. "Rolle deaktiviert".
  hinweis?: string;
};

// Suchtext einer Option — Gruppe (meist der Personenname) UND Label
// zusammen, sonst ließe sich z.B. bei "Name" als Gruppe und "Sekretär" als
// Label nicht nach dem Namen suchen.
function suchtext(o: PersonSelectOption) {
  return o.group ? `${o.group} ${o.label}` : o.label;
}

const TRIGGER_KLASSE =
  "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50";

const ITEM_KLASSE =
  "relative flex min-h-11 w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50";

export function PersonSelect({
  id,
  name,
  defaultValue,
  required,
  placeholder,
  options,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  options: PersonSelectOption[];
}) {
  // Bewusst eine flache Liste statt Gruppen-Überschriften: jede Zeile nennt Person UND Rolle,
  // so ist auf dem Handy ohne Kontext klar, was man antippt (Gruppen-Köpfe wirkten wie Auswahlzeilen).
  const items = options;
  const defaultItem =
    defaultValue != null
      ? (options.find((o) => o.value === defaultValue) ?? null)
      : null;

  return (
    <Combobox.Root<PersonSelectOption>
      items={items}
      name={name}
      required={required}
      defaultValue={defaultItem}
      filter={(option, query) =>
        suchtext(option)
          .toLocaleLowerCase("de-DE")
          .includes(query.toLocaleLowerCase("de-DE"))
      }
    >
      <Combobox.Trigger id={id} className={TRIGGER_KLASSE}>
        <span className="flex-1 truncate text-left">
          <Combobox.Value placeholder={placeholder}>
            {(value: PersonSelectOption | null) =>
              value
                ? value.group
                  ? `${value.group} · ${value.label}`
                  : value.label
                : (placeholder ?? "")
            }
          </Combobox.Value>
        </span>
        <Combobox.Icon>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Combobox.Icon>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="isolate z-50 outline-none"
          sideOffset={4}
          align="start"
        >
          <Combobox.Popup className="w-(--anchor-width) min-w-64 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Combobox.Input
              placeholder="Suchen…"
              className="h-8 w-full border-0 border-b border-border bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Combobox.Empty className="px-2.5 py-2 text-xs text-muted-foreground">
              Keine Treffer.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto scroll-py-1 p-1 outline-0">
              {(o: PersonSelectOption) => (
                <PersonOption key={o.value} option={o} />
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function PersonOption({ option }: { option: PersonSelectOption }) {
  return (
    <Combobox.Item
      value={option}
      disabled={option.disabled}
      className={ITEM_KLASSE}
    >
      <Combobox.ItemIndicator className="absolute right-2 flex items-center justify-center">
        <CheckIcon className="size-4" />
      </Combobox.ItemIndicator>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {option.group ? (
          <>
            <span className="truncate font-medium">{option.group}</span>
            <span className="truncate text-xs text-muted-foreground">
              {option.label}
            </span>
          </>
        ) : (
          <span className="truncate">{option.label}</span>
        )}
      </span>
      {option.hinweis && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {option.hinweis}
        </span>
      )}
    </Combobox.Item>
  );
}
