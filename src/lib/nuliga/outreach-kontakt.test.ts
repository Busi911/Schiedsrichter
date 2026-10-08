import { describe, expect, it } from "vitest";
import { extrahiereKontaktEmail } from "./outreach-kontakt";

describe("extrahiereKontaktEmail", () => {
  it("findet E-Mail im Kontaktadresse-Abschnitt", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p>Max Müller<br/>Tel. 0641 123456<br/><a href="mailto:vorstand@mein-verein.de">vorstand@mein-verein.de</a></p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("vorstand@mein-verein.de");
  });

  it("findet nackte E-Mail im Kontaktabschnitt (ohne mailto)", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p>Max Müller<br/>vorstand@mein-verein.de</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("vorstand@mein-verein.de");
  });

  it("findet E-Mail auch bei 'Kontakt' als Überschrift", () => {
    const html = `<html><body><h2>Kontakt</h2><p><a href="mailto:info@mein-verein.de">info@mein-verein.de</a></p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("info@mein-verein.de");
  });

  it("gibt null zurück wenn keine E-Mail im Kontaktabschnitt", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p>Max Müller<br/>Tel. 0641 123456</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBeNull();
  });

  it("filtert Blacklist-Domains (beispiel.invalid)", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p><a href="mailto:geheim@beispiel.invalid">geheim@beispiel.invalid</a></p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBeNull();
  });

  it("filtert liga.nu-Domains", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p><a href="mailto:admin@hhv-handball.liga.nu">admin@hhv-handball.liga.nu</a></p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBeNull();
  });

  it("gibt null zurück bei fehlendem Kontaktabschnitt", () => {
    const html = `<html><body><h1>Willkommen</h1><p>Keine Kontaktadresse hier</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBeNull();
  });

  it("findet E-Mail im Fixture (vereinsinfo-linden)", () => {
    const html = `<html><body><h1>Hessischer Handball-Verband e.V.<br/>HSG Linden</h1><h2>Kontaktadresse</h2><p>Mustermann, Max<br/>Beispielstraße 1, 00000 Beispielstadt<br/>Tel. 0641 123456<br/><a href="mailto:geheim@beispiel.invalid">geheim@beispiel.invalid</a></p></body></html>`;
    // Beispiel.invalid ist blacklisted → null
    expect(extrahiereKontaktEmail(html)).toBeNull();
  });

  it("findet E-Mail bei echtem Verein mit gültiger Domain", () => {
    const html = `<html><body><h1>HHV</h1><h2>Kontaktadresse</h2><p>Vorstand<br/><a href="mailto:vorstand@tv1886-trebur.de">vorstand@tv1886-trebur.de</a></p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("vorstand@tv1886-trebur.de");
  });

  it("decodiert encodeEmail-Aufrufe (nuLiga-Spam-Schutz)", () => {
    // encodeEmail('de', 'beate', 'voegele-online', '') → beate@voegele-online.de
    const html = `<html><body><h2>Kontaktadresse</h2><p>Beate Voegele<br/>Tel. 06158 85540<br/>encodeEmail('de', 'beate', 'voegele-online', '')</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("beate@voegele-online.de");
  });

  it("decodiert encodeEmail für Handball@SVC1946.de", () => {
    const html = `<html><body><h2>Kontaktadresse</h2><p>encodeEmail('de', 'Handball', 'SVC1946', '')</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("handball@svc1946.de");
  });

  it("decodiert encodeEmail mit Nachname (4. Parameter)", () => {
    // encodeEmail('de', 'Matthias', 'tus-kriftel', 'Brand') → matthias.brand@tus-kriftel.de
    const html = `<html><body><h2>Kontaktadresse</h2><p>encodeEmail('de', 'Matthias', 'tus-kriftel', 'Brand')</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("matthias.brand@tus-kriftel.de");
  });

  it("bevorzugt Vereins-Adresse ueber Personen-Adresse bei mehreren encodeEmail", () => {
    // HSG Schwarzbach: zwei encodeEmail-Aufrufe
    // 1. encodeEmail('de', 'Matthias', 'tus-kriftel', 'Brand') → matthias.brand@tus-kriftel.de (Person)
    // 2. encodeEmail('de', 'mail', 'hsg-schwarzbach', '') → mail@hsg-schwarzbach.de (Verein)
    const html = `<html><body><h2>Kontaktadresse</h2><p>encodeEmail('de', 'Matthias', 'tus-kriftel', 'Brand') encodeEmail('de', 'mail', 'hsg-schwarzbach', '')</p></body></html>`;
    expect(extrahiereKontaktEmail(html)).toBe("mail@hsg-schwarzbach.de");
  });
});
