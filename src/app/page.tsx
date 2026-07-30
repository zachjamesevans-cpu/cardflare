import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ForPlayers } from "@/components/marketing/for-players";
import { ForStores } from "@/components/marketing/for-stores";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ProductPreview } from "@/components/marketing/product-preview";
import { WaitlistSection } from "@/components/marketing/waitlist-section";
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
        <HowItWorks />
        <ForPlayers />
        <ForStores />
        <ProductPreview />
        <WaitlistSection />
      </main>

      <SiteFooter />
    </>
  );
}
