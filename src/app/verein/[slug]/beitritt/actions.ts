"use server";

import { reicheBeitrittEin, type EinreichErgebnis } from "@/lib/beitritt-daten";

function text(formData: FormData, feld: string): string {
  const w = formData.get(feld);
  return typeof w === "string" ? w : "";
}

// Öffentlich, ohne Login (Add-on Vereinsverwaltung, Schalter "Online-Beitritt"). Der Verein kommt immer aus dem Slug der Seite, nie aus dem Formular.
export async function beitrittEinreichen(slug: string, formData: FormData): Promise<EinreichErgebnis> {
  return reicheBeitrittEin(
    slug,
    {
      vorname: text(formData, "vorname"),
      name: text(formData, "name"),
      geburtsdatum: text(formData, "geburtsdatum"),
      email: text(formData, "email"),
      telefon: text(formData, "telefon"),
      geschlecht: text(formData, "geschlecht"),
      mannschaftId: text(formData, "mannschaftId"),
      datenschutz: formData.get("datenschutz") === "on",
      satzung: formData.get("satzung") === "on",
      fotos: formData.get("fotos") === "on",
    },
    // Köderfeld: für Menschen unsichtbar, Bots füllen es aus.
    text(formData, "website")
  );
}
