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

export const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#for-players", label: "For Players" },
  { href: "#for-stores", label: "For Stores" },
] as const;

export const WAITLIST_ANCHOR = "#waitlist";
