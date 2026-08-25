/** Static site-wide facts. Imported by metadata, nav, footer and sitemap. */

export const SITE = {
  name: "cardflare",
  domain: "cardflare.gg",
  tagline: "Find the card. Make the trade.",
  description:
    "cardflare is the hub for in-person card trading, buying and selling. Post the cards you need and cardflare connects you with the people who have them: players near you, your local game store, vendors at card shows.",
  contactEmail: "hello@cardflare.gg",
  /**
   * Where the contact form delivers.
   *
   * Separate from `contactEmail` on purpose: that address is published
   * in the privacy policy, the terms and the waitlist unsubscribe line,
   * so it is a promise made to people who already have it. This one is
   * where the form's mail lands, and the two can diverge without
   * rewriting legal copy.
   */
  contactInbox: "info@cardflare.gg",
} as const;

/**
 * Canonical origin. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every
 * deployment, which keeps preview builds from advertising the production
 * domain before DNS is live.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * Links to sections of the landing page.
 *
 * These must stay root-relative (`/#id`) rather than bare fragments (`#id`).
 * The header and footer render on the legal pages too, and a bare fragment
 * there only rewrites the address bar: the target element does not exist on
 * `/privacy`, so the browser has nothing to scroll to and the visitor is
 * stranded. With the leading slash the browser navigates home first, then
 * scrolls. On the landing page itself it still resolves to a same-page jump.
 */
export const ANCHORS = {
  howItWorks: "/#how-it-works",
  forPlayers: "/#for-players",
  forVendors: "/#for-vendors",
  forStores: "/#for-stores",
  pricing: "/#pricing",
  invite: "/#request-invite",
} as const;

export const NAV_LINKS = [
  { href: ANCHORS.howItWorks, label: "How It Works" },
  { href: ANCHORS.forPlayers, label: "For Players" },
  { href: ANCHORS.forVendors, label: "For Vendors" },
  { href: ANCHORS.forStores, label: "For Stores" },
  { href: ANCHORS.pricing, label: "Pricing" },
] as const;
