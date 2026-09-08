import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AudienceTrio } from "@/components/marketing/audience-trio";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { ThreePlaces } from "@/components/marketing/three-places";
import { UltraBand } from "@/components/marketing/ultra-band";
import { SITE, siteUrl } from "@/lib/site";

/**
 * Organization + WebSite structured data. Kept minimal and truthful: no
 * aggregate ratings, no product claims, no fabricated social profiles.
 */
function StructuredData() {
  const origin = siteUrl();
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE.name,
        url: origin,
        logo: `${origin}/brand/cardflare-mark.png`,
        description: SITE.description,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: SITE.name,
        url: origin,
        description: SITE.description,
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: "en-US",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <SiteHeader />

      <main id="main" className="flex-1">
        <Hero />
        <ThreePlaces />
        <HowItWorks />
        <UltraBand />
        <AudienceTrio />
        <Pricing />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
