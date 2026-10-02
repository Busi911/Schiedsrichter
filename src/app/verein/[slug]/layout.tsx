import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { FanKopf, FanTheme } from "@/components/liga/fan-rahmen";
import { SponsorSplash } from "@/components/liga/sponsor-splash";
import { holeSponsor } from "@/lib/sponsor";
import { VereinsNav } from "@/components/liga/vereins-nav";
import { holeVereinsDesign, holeVerein, holeVorschau } from "@/lib/liga-oeffentlich";
import { vereinsFarbton, vereinsInitialen } from "@/lib/liga-pwa";
import { formatDatum } from "@/lib/format";
import { saisonLabel } from "@/lib/saison";

type Props = { params: Promise<{ slug: string }> };

// Die Seite ist eine installierbare Web-App mit Namen/Farbe/Icon des Vereins.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return {};
  const v = (await holeVereinsDesign(verein.id)).logoVersion ?? "";
  // Vorschau (Verein noch in Vorbereitung): funktioniert wie die echte Seite,
  // wird aber nicht von Suchmaschinen indexiert.
  const vorschau = await holeVorschau(verein.vereinId);
  return {
    ...(vorschau && { robots: { index: false, follow: false } }),
    manifest: `/verein/${verein.slug}/manifest.webmanifest`,
    icons: {
      icon: `/verein/${verein.slug}/icon/192?v=${v}`,
      apple: `/verein/${verein.slug}/icon/180?v=${v}`,
    },
    appleWebApp: { capable: true, title: verein.name, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  const farbton = verein ? (await holeVereinsDesign(verein.id)).farbton : null;
  return { themeColor: `hsl(${farbton ?? vereinsFarbton(slug)} 55% 28%)` };
}

export default async function VereinsHuelle({
  children,
  params,
}: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) notFound();

  const { logoVersion, farbton } = await holeVereinsDesign(verein.id);
  const vorschau = await holeVorschau(verein.vereinId);
  const sponsor = await holeSponsor(verein.vereinId);

  return (
    <>
      {sponsor && (
        <SponsorSplash
          bildUrl={`/verein/${verein.slug}/sponsor?v=${sponsor.version}`}
          name={sponsor.name}
          link={sponsor.link}
          dauerSekunden={sponsor.dauerSekunden}
          version={`${verein.slug}-${sponsor.version}`}
        />
      )}
      {vorschau && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <strong>Vorschau</strong> –{" "}
          {vorschau.bis
            ? `dieser Zugang ist zeitlich begrenzt (bis ${formatDatum(vorschau.bis)}).`
            : "der Verein ist noch in Vorbereitung."}
        </div>
      )}
      <FanTheme hue={farbton ?? vereinsFarbton(verein.slug)} />
      <FanKopf
        titel={verein.name}
        untertitel={`Saison ${saisonLabel(new Date())}`}
        initialen={vereinsInitialen(verein.name)}
        logoUrl={logoVersion ? `/verein/${verein.slug}/logo?v=${logoVersion}` : undefined}
      />
      <VereinsNav basis={`/verein/${verein.slug}`} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
