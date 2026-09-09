import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/layout/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} handles account information, invite requests, messages and basic analytics.`,
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "9 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="What this covers">
        <p>
          This policy describes what {SITE.name} collects from the {SITE.domain}
          website and the {SITE.name} app, and what we do with it: player accounts,
          guest sessions, invite requests from stores and vendors, and the messages
          players send each other about cards.
        </p>
      </LegalSection>

      <LegalSection heading="Information you give us">
        <p>When you create a player account we store:</p>
        <ul>
          <li>Your email address, display name and handle.</li>
          <li>
            What you add to your profile: a picture, the games you play, your wants and
            decks, and optionally a five-digit ZIP. A device location, when you grant
            one, rides a single request and is never stored.
          </li>
          <li>
            Messages you send other players about a card, so both sides of the
            conversation can read it.
          </li>
          <li>
            In the app, if you allow notifications, the push token your phone gives us,
            so an offer on your Flare can reach you. Turning notifications off removes
            it.
          </li>
          <li>
            If you subscribe to {SITE.name} Pro in the app, Apple bills it and holds
            your payment details. We receive the transaction reference and whether the
            subscription is active, never your card.
          </li>
        </ul>
        <p>
          <strong>Payments and subscriptions.</strong> {SITE.name} Ultra for stores, and
          {SITE.name} Pro when bought on the website, are billed through Stripe. You
          enter your card on a page Stripe hosts, and Stripe collects and processes your
          payment method, billing details, contact details and transaction history under
          its own privacy policy. {SITE.name} never receives or stores a full card
          number. What we do keep, so the subscription works, is: your Stripe customer
          and subscription identifiers, the plan you chose, the subscription&rsquo;s
          status (trialing, active, past due or cancelled), the date it is paid through,
          and whether it is set to end at that date. We send Stripe your account email
          and an internal account reference so it can match the subscription to you.
          Receipts and invoices live with Stripe, not with us.
        </p>
        <p>When a store or vendor requests an invite we store:</p>
        <ul>
          <li>A first name, an email address and the business type.</li>
          <li>
            Anything optionally added: primary card game, city, state or region, store
            name, and the comment.
          </li>
        </ul>
        <p>
          We do not ask for a mailing address or phone number, and we never see your
          card number.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul>
          <li>To run the product: accounts, rooms, Flares, the Feed and messages.</li>
          <li>To answer invite requests from stores and vendors.</li>
          <li>To email you about your account and, if you opted in, product news.</li>
        </ul>
        <p>We do not sell your information, and we do not share it with advertisers.</p>
      </LegalSection>

      <LegalSection heading="Email">
        <p>
          We email what your account needs: sign-in links, password resets, and
          notifications you can expect, like an offer landing on your Flare. An invite
          request gets a reply about setting you up.
        </p>
        <p>
          The optional box on the invite form is separate: tick it and we may also send
          news, event announcements and trading tips. Leave it unticked and we will not.
        </p>
        <p>Every marketing email we send includes a way to unsubscribe.</p>
      </LegalSection>

      <LegalSection heading="Playing as a guest">
        <p>
          You can join {SITE.name} as a player without an account. We ask for a display
          name and nothing else: no email address, no password, no phone number.
        </p>
        <p>
          We store that display name, the times the session was created and last used,
          and a random value that identifies your device. That value is held only as a
          one-way hash, so the copy in our database cannot be used to sign in as you.
        </p>
        <p>
          The session expires after 30 days of not being used. &ldquo;Leave and forget
          this device&rdquo; on the player page deletes it immediately.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          {SITE.name} sets one cookie for players, which keeps you signed in to your
          guest session. It is strictly necessary for that feature and is not used for
          advertising or cross-site tracking. Stores signing in also get a session
          cookie from our authentication provider.
        </p>
      </LegalSection>

      <LegalSection heading="Analytics">
        <p>
          We use privacy-conscious, aggregate analytics to understand how many people
          visit the site and which sections they read. These measurements are not linked
          to your account, and the site works normally if you block analytics.
        </p>
      </LegalSection>

      <LegalSection heading="Where your information is stored">
        <p>
          Accounts, invite requests and messages are stored in a Supabase (PostgreSQL)
          database. The site is hosted on Vercel. Card payments are handled by Stripe.
          All three providers process data on our behalf under their own security and
          privacy terms.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          We keep your account while it is active and invite requests while we are
          answering them. Ask us to delete yours at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Deleting your data">
        <p>
          You can delete your account yourself: in the app, open your profile, then
          settings, then Delete your account; on the website, the same card sits at the
          bottom of your profile settings. It removes your profile, Flares, lists,
          showcase, messages and unlocks at once, and it cannot be undone. A
          subscription is cancelled separately: Pro bought in the app in your Apple
          subscription settings, and Pro or Ultra bought on the website from the Manage
          billing button on your plan page. Stripe keeps its own records of past
          payments as the law requires it to.
        </p>
        <p>
          You can also email{" "}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> from the
          address you signed up with and ask us to delete your account or your invite
          request, or for a copy of what we hold about you.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          {SITE.name} is not intended for children under 13. If you believe a child has
          signed up, contact us and we will remove the account.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this page.
          Material changes will also go out by email.
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
