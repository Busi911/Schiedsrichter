"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LabeledSelectOption = { value: string; label: string };

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
          {(value: string) =>
            options.find((o) => o.value === value)?.label ??
            placeholder ??
            value
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
