/**
 * The setup wizard's steps, in the order a new store walks them.
 *
 * A plain module: the page reads the order, the tests pin it, and the
 * actions file may export nothing but async functions (see
 * `tests/unit/server-action-exports.test.ts`).
 */
export const SETUP_STEPS = [
  "welcome",
  "page",
  "screens",
  "event",
  "team",
  "done",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: string | undefined): value is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(value ?? "");
}

/** The step after this one, or null at the end. */
export function nextSetupStep(step: SetupStep): SetupStep | null {
  const at = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[at + 1] ?? null;
}

/** The wizard's URL for a step, with the store carried along. */
export function setupHref(storeId: string, step: SetupStep): string {
  return `/store/setup?as=${storeId}&step=${step}`;
}
