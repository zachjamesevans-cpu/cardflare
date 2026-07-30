import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/layout/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} handles waitlist information, email updates and basic analytics.`,
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "30 July 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="What this covers">
        <p>
          This policy describes what {SITE.name} collects from the {SITE.domain} website
          while the product is in development, and what we do with it. Right now the
          only thing you can give us is a waitlist signup.
        </p>
      </LegalSection>

      <LegalSection heading="Information you give us">
        <p>When you join the waitlist we store:</p>
        <ul>
          <li>Your first name and email address.</li>
          <li>The user type you selected, such as player or local game store.</li>
          <li>
            Anything you optionally add: primary card game, city, state or region, local
            game store, and your comment.
          </li>
          <li>
            Whether you consented to receive updates, and the page the signup came from.
          </li>
        </ul>
        <p>
          We ask for a first name rather than a full name, and we do not ask for a
          mailing address, phone number or payment details.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul>
          <li>To email you {SITE.name} product and launch updates.</li>
          <li>
            To decide which cities and stores to approach for the first pilot events.
          </li>
          <li>To contact you if you asked about running a store pilot.</li>
        </ul>
        <p>We do not sell your information, and we do not share it with advertisers.</p>
      </LegalSection>

      <LegalSection heading="Email">
        <p>
          We only email you if you ticked the consent box when you signed up. Every
          email we send includes a way to unsubscribe, and unsubscribing does not remove
          you from the waitlist itself &mdash; tell us if you want both.
        </p>
      </LegalSection>

      <LegalSection heading="Analytics">
        <p>
          We use privacy-conscious, aggregate analytics to understand how many people
          visit the site and which sections they read. These measurements are not linked
          to your waitlist entry, and the site works normally if you block analytics.
        </p>
      </LegalSection>

      <LegalSection heading="Where your information is stored">
        <p>
          Waitlist entries are stored in a Supabase (PostgreSQL) database. The site is
          hosted on Vercel. Both providers process data on our behalf under their own
          security and privacy terms.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          We keep waitlist entries until {SITE.name} launches and you have had a chance
          to create an account, or until you ask us to delete yours, whichever comes
          first.
        </p>
      </LegalSection>

      <LegalSection heading="Deleting your data">
        <p>
          Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> from the
          address you signed up with and ask us to delete your waitlist entry. We will
          remove it and confirm when it is done. You can also ask us for a copy of what
          we hold about you.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The {SITE.name} waitlist is not intended for children under 13. If you believe
          a child has signed up, contact us and we will remove the entry.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this page.
          Material changes will also go out to the waitlist by email.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy can go to{" "}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
