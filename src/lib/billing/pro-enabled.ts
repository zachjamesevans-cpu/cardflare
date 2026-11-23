/**
 * Whether cardflare Pro and the Embers shop are on sale.
 *
 * OFF for the App Store launch, by the founder's call (2026-11-22):
 * "hide both shop and pro for launch ... flarecast ultra and max are
 * both web things anyways for now and thats where our main revenues
 * streams will be." The shop felt half-baked, and Pro sells the
 * shop's cosmetics, so the two go together.
 *
 * Off means, on both platforms:
 * - No door to Pro or the Embers shop: no paywall, no shop icon, no
 *   "Get Pro", no pack or shop cards in the Feed, no Look or Showcase
 *   tabs on Edit profile, no Pro card in Settings.
 * - The Pro limits that would otherwise wall a free player off with no
 *   way through are lifted for everyone (FREE_AT_LAUNCH in
 *   src/lib/tiers/index.ts): trade history and logging, 50 hunts, GIF
 *   pictures, a whole list on the store's TV. Whole-page scanning stays
 *   Pro (it costs per page) and simply isn't offered.
 * - Embers are still earned from trades and still shown.
 * - Somebody already on Pro keeps it: their tier is untouched, and the
 *   /pro page still answers so a Stripe subscriber can manage billing.
 *
 * Nothing is deleted. Turning it back on is this constant and its twin
 * in mobile/src/pro-enabled.ts (tests/unit/pro-enabled.test.ts holds
 * them equal), a deploy, and a TestFlight build.
 */
export const PRO_ENABLED = false;
