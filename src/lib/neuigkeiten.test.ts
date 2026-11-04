import { describe, expect, it } from "vitest";
import { anzeigeHost, FeedFehler, istOeffentlicheIp, parseFeed, pruefeFeedUrl, zuReinemText } from "./neuigkeiten";

describe("pruefeFeedUrl", () => {
  it("nimmt öffentliche https-Adressen an (auch feed://)", () => {
    expect(pruefeFeedUrl(" https://www.hsg-test.de/feed/ ")).toBe("https://www.hsg-test.de/feed/");
    expect(pruefeFeedUrl("feed://hsg-test.de/rss.xml")).toBe("https://hsg-test.de/rss.xml");
  });
  it.each([
    ["", /eintragen/],
    ["http://www.hsg-test.de/feed", /https/],
    ["javascript:alert(1)", /https|ungültig/],
    ["https://user:pw@hsg-test.de/feed", /Zugangsdaten/],
    ["https://hsg-test.de:8443/feed", /Standardport/],
    ["https://127.0.0.1/feed", /IP-Adresse/],
    ["https://169.254.169.254/latest/meta-data", /IP-Adresse/],
    ["https://[::1]/feed", /IP-Adresse/],
    ["https://localhost/feed", /nicht öffentlich/],
    ["https://intranet/feed", /nicht öffentlich/],
    ["https://server.internal/feed", /nicht öffentlich/],
    ["https://a b.de/feed", /ungültig/],
  ])("lehnt %s ab", (eingabe, muster) => {
    expect(() => pruefeFeedUrl(eingabe)).toThrow(FeedFehler);
    expect(() => pruefeFeedUrl(eingabe)).toThrow(muster);
  });
});

describe("istOeffentlicheIp", () => {
  it("erkennt interne Bereiche", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "kein-ip"]) {
      expect(istOeffentlicheIp(ip), ip).toBe(false);
    }
  });
  it("lässt öffentliche durch", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(istOeffentlicheIp(ip), ip).toBe(true);
  });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>HSG</title>
<item><title><![CDATA[Sieg im Derby &amp; mehr]]></title><link>https://www.hsg-test.de/derby</link><guid isPermaLink="false">p-1</guid>
<pubDate>Mon, 02 Nov 2026 18:00:00 +0000</pubDate>
<description><![CDATA[<p>Die <b>Männer</b> gewinnen&nbsp;mit 30:25.</p><script>alert(1)</script><img src="x.jpg">]]></description></item>
<item><title>Ältere Meldung</title><link>https://www.hsg-test.de/alt</link><pubDate>Fri, 30 Oct 2026 10:00:00 +0000</pubDate>
<description>&lt;p&gt;Text &amp;amp; Zeichen&lt;/p&gt;</description></item>
<item><title>Böser Link</title><link>javascript:alert(1)</link></item>
<item><link>https://www.hsg-test.de/ohne-titel</link></item>
<item><title>Ohne Datum</title><link>https://www.hsg-test.de/x</link></item>
</channel></rss>`;

describe("parseFeed", () => {
  it("liest RSS: reiner Text, neueste zuerst, schlechte Einträge verworfen", () => {
    const e = parseFeed(RSS);
    expect(e.map((x) => x.titel)).toEqual(["Sieg im Derby & mehr", "Ältere Meldung", "Ohne Datum"]);
    expect(e[0]).toMatchObject({ guid: "p-1", link: "https://www.hsg-test.de/derby", auszug: "Die Männer gewinnen mit 30:25." });
    expect(e[0].datum?.toISOString()).toBe("2026-11-02T18:00:00.000Z");
    expect(e[1].auszug).toBe("Text & Zeichen");
    expect(e[1].guid).toBe("https://www.hsg-test.de/alt");
    expect(e[2].datum).toBeNull();
    expect(JSON.stringify(e)).not.toMatch(/<|script|alert|x\.jpg/);
  });
  it("liest Atom (link href, summary, updated)", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:x,1</id><title>Training fällt aus</title>
      <link rel="alternate" href="https://hsg-test.de/a?x=1&amp;y=2"/><link rel="self" href="https://hsg-test.de/self"/>
      <updated>2026-11-03T12:00:00Z</updated><summary type="html">&lt;b&gt;Heute&lt;/b&gt; kein Training</summary></entry></feed>`;
    expect(parseFeed(atom)).toEqual([
      { guid: "tag:x,1", titel: "Training fällt aus", link: "https://hsg-test.de/a?x=1&y=2", datum: new Date("2026-11-03T12:00:00Z"), auszug: "Heute kein Training" },
    ]);
  });
  it("kürzt Titel und Auszug, begrenzt die Anzahl", () => {
    const viele = Array.from({ length: 40 }, (_, i) => `<item><title>${"T".repeat(300)}</title><link>https://h.de/${i}</link><description>${"wort ".repeat(200)}</description></item>`).join("");
    const e = parseFeed(`<rss><channel>${viele}</channel></rss>`);
    expect(e).toHaveLength(30);
    expect(e[0].titel.length).toBeLessThanOrEqual(201);
    expect(e[0].auszug!.length).toBeLessThanOrEqual(301);
  });
  it("lehnt Nicht-Feeds ab, verarbeitet keine eigenen Entities", () => {
    expect(() => parseFeed("<html><body>Hallo</body></html>")).toThrow(/kein RSS/);
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title><link>https://h.de/1</link></item></channel></rss>`;
    expect(parseFeed(xxe)[0].titel).toBe("&x;");
  });
  it("leerer Feed ist gültig, aber ohne Einträge", () => {
    expect(parseFeed("<rss><channel><title>x</title></channel></rss>")).toEqual([]);
  });
});

describe("Text-Helfer", () => {
  it("zuReinemText entfernt Tags und Steuerzeichen", () => {
    expect(zuReinemText("<p>Eins</p><p>Zwei\u0001</p>")).toBe("Eins Zwei");
  });
  it("anzeigeHost", () => {
    expect(anzeigeHost("https://www.hsg-test.de/a")).toBe("hsg-test.de");
    expect(anzeigeHost("kaputt")).toBe("der Homepage");
  });
});
