import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { FanKopf, FanTheme } from "@/components/liga/fan-rahmen";
import { holeLogoVersion, holeVerein } from "@/lib/liga-oeffentlich";
import { vereinsFarbton, vereinsInitialen } from "@/lib/liga-pwa";
import { saisonLabel } from "@/lib/saison";

type Props = { params: Promise<{ slug: string }> };

// Die Seite ist eine installierbare Web-App mit Namen/Farbe/Icon des Vereins.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return {};
  const v = (await holeLogoVersion(verein.id)) ?? "";
  return {
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
  return { themeColor: `hsl(${vereinsFarbton(slug)} 55% 28%)` };
}

export default async function VereinsHuelle({
  children,
  params,
}: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) notFound();

  const logoVersion = await holeLogoVersion(verein.id);

  return (
    <>
      <FanTheme hue={vereinsFarbton(verein.slug)} />
      <FanKopf
        titel={verein.name}
        untertitel={`Saison ${saisonLabel(new Date())}`}
        initialen={vereinsInitialen(verein.name)}
        logoUrl={logoVersion ? `/verein/${verein.slug}/logo?v=${logoVersion}` : undefined}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
