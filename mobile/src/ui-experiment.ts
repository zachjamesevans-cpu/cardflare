/**
 * The search and nearby-traders UI EXPERIMENT, the app's switch.
 *
 * OFF unless Metro was started with EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT=1
 * (Expo inlines EXPO_PUBLIC_* into the bundle when it is built), so every
 * EAS, TestFlight and App Store build has it off: none of them sets it.
 * Off, the Search tab and the Nearby tab are exactly what they were.
 *
 * On:
 * - Search is the experiment's screen (screens/search-lab.tsx): game
 *   chips, recent cards, browse by game, artwork-first results.
 * - Nearby gains "Traders near you" above its Flares (traders-strip.tsx),
 *   opening the full list (screens/traders.tsx).
 *
 * The one new request, GET /api/v1/nearby/traders, goes to
 * EXPERIMENT_API_BASE: the `next dev` on this Mac with the website's
 * CARDFLARE_UI_EXPERIMENT=1. Everything else still talks to cardflare.gg.
 * How to run it, switch it off and remove it: docs/UI_EXPERIMENT.md.
 */
export const UI_EXPERIMENT = process.env.EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT === "1";

/** Where the experiment's own endpoint lives: the local website, named
    at Metro's start as EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API. */
export const EXPERIMENT_API_BASE: string | null =
  process.env.EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API || null;

/** The experiment's paths, answered by the local server when it is set. */
export function experimentPath(path: string): boolean {
  return path.startsWith("/api/v1/nearby/traders");
}
