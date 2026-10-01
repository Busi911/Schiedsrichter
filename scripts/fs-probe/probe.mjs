// Einmalige Hilfs-Sonde (keine Produktfunktion): zeigt die Struktur der nuLiga-Seiten
// zu Freundschaftsspielen (clubTeams-Eintrag, Gruppenseite, Mannschaftsportrait).
const BASIS = "https://hhv-handball.liga.nu/cgi-bin/WebObjects/nuLigaHBDE.woa/wa";
const UA = "Handballerpate/1.0 (Vereinsseiten; Abruf mit Zustimmung des HHV)";
const hole = async (url) => {
  await new Promise((r) => setTimeout(r, 1200));
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  console.log(`GET ${url.replace(BASIS, "")} -> ${res.status}`);
  return res.text();
};
const inhalt = (html) => {
  const m = html.match(/<div id="content"[\s\S]*?<div id="footer-external"/i);
  return (m ? m[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+/g, " ")
    .slice(0, 7000);
};
const club = await hole(`${BASIS}/clubTeams?club=${process.env.CLUB ?? "69723"}`);
const fs = [...club.matchAll(/groupPage\?championship=([^&"]*)&amp;group=(\d+)">([^<]*)</g)].filter((m) =>
  /FS/.test(decodeURIComponent(m[1]))
);
console.log(`FS-Eintraege in der Vereinsliste: ${fs.length}`);
for (const m of fs.slice(0, 6)) console.log(`  ${decodeURIComponent(m[1])} | group ${m[2]} | ${m[3].trim()}`);
if (fs.length) {
  const [, champ, group] = fs[0];
  const gp = await hole(`${BASIS}/groupPage?championship=${champ}&group=${group}`);
  console.log("=== GROUPPAGE (gekuerzt) ===\n" + inhalt(gp));
  const tp = [...gp.matchAll(/teamPortrait\?teamtable=(\d+)[^"]*"/g)].map((m) => m[0].replace(/&amp;/g, "&").replace(/"$/, ""));
  console.log(`teamPortrait-Links: ${tp.length}`);
  if (tp[0]) {
    const p = await hole(`${BASIS}/${tp[0]}`);
    console.log("=== TEAMPORTRAIT (gekuerzt) ===\n" + inhalt(p));
  }
}
