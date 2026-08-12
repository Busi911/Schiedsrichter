"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// group ist optional — z.B. für "Person wählen…", wo eine Person mehrere
// Rollen haben kann (siehe monats-kalender.tsx): der Name erscheint dann
// einmal als Gruppen-Überschrift statt bei jeder Rolle wiederholt zu
// werden. Ohne group rendert die Liste unverändert flach.
export type LabeledSelectOption = {
  value: string;
  label: string;
  group?: string;
};

function gruppiere(options: LabeledSelectOption[]) {
  const gruppen: { name: string | null; optionen: LabeledSelectOption[] }[] = [];
  for (const option of options) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.name === (option.group ?? null)) {
      letzte.optionen.push(option);
    } else {
      gruppen.push({ name: option.group ?? null, optionen: [option] });
    }
  }
  return gruppen;
}

export function LabeledSelect({
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
  options: LabeledSelectOption[];
}) {
  return (
    <Select name={name} defaultValue={defaultValue} required={required}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder}>
          {(value: string) => {
            const gewaehlt = options.find((o) => o.value === value);
            if (!gewaehlt) return placeholder ?? value;
            // Ausgewählt zeigt "Gruppe: Label" (z.B. "Dennis Weber:
            // Schiedsrichter"), damit im geschlossenen Zustand nicht nur
            // die Rolle ohne Namen zu sehen ist — die Gruppen-Überschrift
            // ist dort ja nicht mehr sichtbar.
            return gewaehlt.group
              ? `${gewaehlt.group}: ${gewaehlt.label}`
              : gewaehlt.label;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {gruppiere(options).map((gruppe, i) =>
          gruppe.name ? (
            <SelectGroup key={`${gruppe.name}-${i}`}>
              <SelectLabel>{gruppe.name}</SelectLabel>
              {gruppe.optionen.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            gruppe.optionen.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))
          )
        )}
      </SelectContent>
    </Select>
  );
}
