/**
 * The search and nearby-traders UI EXPERIMENT, the app's switch.
 *
 * ON since the founder shipped it (2026-11-22: "push this to main branch
 * and app"). OFF only when the bundle is built with
 * EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT=0 (Expo inlines EXPO_PUBLIC_* at
 * build time). Off, the Search tab and the Nearby tab are exactly what
 * they were before it.
 *
 * On:
 * - Search is the experiment's screen (screens/search-lab.tsx): game
 *   chips, recent cards, browse by game, artwork-first results.
 * - Nearby gains "Traders near you" above its Flares (traders-strip.tsx),
 *   opening the full list (screens/traders.tsx).
 *
 * The one new request, GET /api/v1/nearby/traders, goes to cardflare.gg
 * like everything else, unless EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API
 * names a local website to try a server change against.
 * How to run it, switch it off and remove it: docs/UI_EXPERIMENT.md.
 */
export const UI_EXPERIMENT = process.env.EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT !== "0";

/** Where the experiment's own endpoint lives: the local website, named
    at Metro's start as EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API. */
export const EXPERIMENT_API_BASE: string | null =
  process.env.EXPO_PUBLIC_CARDFLARE_UI_EXPERIMENT_API || null;

/** The experiment's paths, answered by the local server when it is set. */
export function experimentPath(path: string): boolean {
  return path.startsWith("/api/v1/nearby/traders");
}
