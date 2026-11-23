/**
 * The search and nearby-traders UI EXPERIMENT, server side.
 *
 * ON since the founder shipped it (2026-11-22). Setting
 * `CARDFLARE_UI_EXPERIMENT=0` in the environment switches its one new
 * endpoint (GET /api/v1/nearby/traders) off, answering 404, without a
 * code change. The app's half is
 * mobile/src/ui-experiment.ts. How to switch it on, off, and remove it:
 * docs/UI_EXPERIMENT.md.
 */
export function uiExperimentEnabled(): boolean {
  return process.env.CARDFLARE_UI_EXPERIMENT !== "0";
}
