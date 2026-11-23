/**
 * The search and nearby-traders UI EXPERIMENT, server side.
 *
 * OFF unless the environment says `CARDFLARE_UI_EXPERIMENT=1`, which no
 * deployed environment does: the experiment runs on a laptop against a
 * local `next dev`, and its one new endpoint (GET /api/v1/nearby/traders)
 * answers 404 everywhere else. The app's half is
 * mobile/src/ui-experiment.ts. How to switch it on, off, and remove it:
 * docs/UI_EXPERIMENT.md.
 */
export function uiExperimentEnabled(): boolean {
  return process.env.CARDFLARE_UI_EXPERIMENT === "1";
}
