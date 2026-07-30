import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/layout/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that apply to the ${SITE.name} website and pre-launch waitlist.`,
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "30 July 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="About these terms">
        <p>
          These terms apply to the {SITE.domain} website and the {SITE.name} waitlist.
          The {SITE.name} application itself is still being built; when it launches, it
          will have its own terms that you will be asked to accept.
        </p>
      </LegalSection>

      <LegalSection heading="What CardFlare is">
        <p>
          {SITE.name} is a discovery and coordination tool. It helps players at the same
          physical event find out who has the cards they are looking for, and helps them
          arrange to meet in person.
        </p>
        <p>
          {SITE.name} is not a marketplace, an escrow service, a payment processor, a
          shipping service, or a card grading or pricing service. We are not a party to
          any trade.
        </p>
      </LegalSection>

      <LegalSection heading="Trades are between players">
        <p>
          Every trade arranged through {SITE.name} is between the players involved. We
          do not verify, guarantee or insure:
        </p>
        <ul>
          <li>That a card is authentic or not counterfeit.</li>
          <li>That a card is in the condition described.</li>
          <li>That a trade is fair, or that either card is worth what someone says.</li>
          <li>That the other player will show up or follow through.</li>
        </ul>
        <p>
          Inspect cards yourself before trading, meet in a public part of the venue, and
          use your own judgement. Trade at your own risk.
        </p>
      </LegalSection>

      <LegalSection heading="Using the waitlist">
        <p>
          Sign up with your own email address and give accurate information. Do not
          submit other people&rsquo;s details, and do not use automated tools to submit
          entries. We may remove entries that look like spam or abuse.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Do not attempt to break, overload, scrape or gain unauthorised access to the
          site, and do not use it to harass anyone or to break the law or a
          venue&rsquo;s rules.
        </p>
      </LegalSection>

      <LegalSection heading="Trading card game trademarks">
        <p>
          One Piece Card Game and all other trading card game names, logos, card names
          and card images are the property of their respective owners. {SITE.name} is an
          independent tool and is not affiliated with, endorsed by, or sponsored by any
          trading card game publisher. Card names are used only to identify cards.
        </p>
      </LegalSection>

      <LegalSection heading="Our content">
        <p>
          The {SITE.name} name, logo and site content belong to {SITE.name}. Please do
          not reuse them without permission.
        </p>
      </LegalSection>

      <LegalSection heading="Availability and changes">
        <p>
          This is a pre-launch site. We may change, pause or remove features, including
          the waitlist, at any time and without notice.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty and limits">
        <p>
          The site is provided &ldquo;as is&rdquo;, without warranties of any kind. To
          the extent the law allows, {SITE.name} is not liable for any loss arising from
          your use of the site or from a trade you arranged through it.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms can go to{" "}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
