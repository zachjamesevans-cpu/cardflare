/** Static site-wide facts. Imported by metadata, nav, footer and sitemap. */

export const SITE = {
  name: "CardFlare",
  domain: "cardflare.gg",
  tagline: "Find the card. Make the trade.",
  description:
    "CardFlare helps players find cards, match with nearby traders, and make in-person trades at local TCG events.",
  contactEmail: "hello@cardflare.gg",
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
  forStores: "/#for-stores",
  waitlist: "/#waitlist",
} as const;

export const NAV_LINKS = [
  { href: ANCHORS.howItWorks, label: "How It Works" },
  { href: ANCHORS.forPlayers, label: "For Players" },
  { href: ANCHORS.forStores, label: "For Stores" },
] as const;

export const WAITLIST_ANCHOR = ANCHORS.waitlist;
