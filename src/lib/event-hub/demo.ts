import type { DisplayFlare, DisplayPayload } from "./display-payload";
import type { HubTimer } from "./timer";

/**
 * A sample night, for the store page.
 *
 * The pitch shows FlareCast by running the real display and the real
 * control panel on this payload, so what a store owner sees is the
 * product, not a drawing of it. Everything here is arithmetic against
 * `now`, exactly like a real row: the clocks count, the intermission
 * counts, and the Flares rotate. Nothing is fetched and nothing is
 * written; the frame on the page holds the whole night.
 *
 * Pure and free of server imports, so the page, the preview route and
 * the tests all build the same night.
 */

export type DemoScene = "focus" | "intermission";

export const DEMO_STORE = "Mox Valley Games";
export const DEMO_NIGHT = "One Piece Locals";
export const DEMO_CODE = "MOX7VG";

const MINUTE = 60_000;
const REGULATION_SECONDS = 35 * 60;

function iso(at: number): string {
  return new Date(at).toISOString();
}

function baseTimer(now: number): HubTimer {
  return {
    id: "demo-timer",
    displayId: "demo-display",
    position: 0,
    game: "one-piece",
    eventName: DEMO_NIGHT,
    round: 3,
    format: "Swiss",
    bracket: "swiss",
    presetId: "store-tournament",
    durationSeconds: REGULATION_SECONDS,
    status: "running",
    startedAt: iso(now - 21 * MINUTE),
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
    beginnerMode: false,
    autoMode: true,
    autoStart: true,
    intermissionSeconds: 180,
    intermissionExtendedMs: 0,
    autoHeldAt: null,
    timeCalledAt: null,
    controlledBy: null,
    controlledAt: null,
    updatedAt: iso(now),
  };
}

/** The tournament as the scene needs it: mid-round, or between rounds. */
export function demoTimer(scene: DemoScene, now: number): HubTimer {
  const timer = baseTimer(now);
  if (scene === "focus") return timer;

  /* Time was called 45 seconds ago: the wall is in the between-rounds
     countdown with two and a quarter minutes to round 4. */
  const called = now - 45_000;
  return {
    ...timer,
    status: "time_called",
    startedAt: iso(called - REGULATION_SECONDS * 1000),
    timeCalledAt: iso(called),
  };
}

/**
 * The cards the sample room is hunting, with their real art.
 *
 * The founder picked these three by hand. Each image is the card
 * trimmed to its own edge: cut to the exact 5:7 frame and its rounded
 * corners made transparent, so no white scanner margin shows on the
 * wall. They ship in `public/flarecast`, so the preview fetches
 * nothing from anybody else.
 */
export const DEMO_FLARES: DisplayFlare[] = [
  {
    cardId: "demo-1",
    cardName: "Trafalgar Law",
    cardNumber: "OP14-009",
    imageUrl: "/flarecast/op14-009.webp",
    quantity: 1,
    people: 1,
    askedBy: "Priya",
    storeMayHave: true,
  },
  {
    cardId: "demo-2",
    cardName: "Nami",
    cardNumber: "OP15-086",
    imageUrl: "/flarecast/op15-086.webp",
    quantity: 3,
    people: 3,
    askedBy: null,
    storeMayHave: false,
  },
  {
    cardId: "demo-3",
    cardName: "Boa Hancock",
    cardNumber: "OP07-051",
    imageUrl: "/flarecast/op07-051.webp",
    quantity: 2,
    people: 1,
    askedBy: "Marcus",
    storeMayHave: true,
  },
];

export function demoFlares(): DisplayFlare[] {
  return DEMO_FLARES.map((flare) => ({ ...flare }));
}

export function demoDisplayPayload(
  scene: DemoScene,
  now: number,
  joinUrl: string,
): DisplayPayload {
  return {
    displayId: "demo-display",
    storeName: DEMO_STORE,
    nightTitle: DEMO_NIGHT,
    layout: "single",
    announcement:
      scene === "intermission" ? "Pairings for round 4 are up at the counter" : null,
    showFlares: true,
    showQr: true,
    soundEnabled: false,
    joinCode: DEMO_CODE,
    joinUrl,
    timers: [demoTimer(scene, now)],
    flares: demoFlares(),
    serverNow: now,
  };
}

/** The moment the sample night is built around: the request's clock. */
export function demoNow(): number {
  return Date.now();
}

export function isDemoScene(value: string | undefined): value is DemoScene {
  return value === "focus" || value === "intermission";
}
