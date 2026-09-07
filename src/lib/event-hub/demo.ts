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
 * Card art for the sample, drawn rather than fetched.
 *
 * Real card images belong to their publishers and are served only
 * when a provider supplied them for a real card. A preview does not
 * get to borrow one, so each sample card is a small SVG: the game's
 * colour, the name, the number. It reads as a card at television size
 * and it is ours.
 */
function sampleArt(name: string, number: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 34%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 16%)"/>
    </linearGradient>
  </defs>
  <rect width="300" height="420" rx="18" fill="url(#g)"/>
  <rect x="18" y="18" width="264" height="300" rx="12" fill="rgba(0,0,0,0.28)"/>
  <circle cx="150" cy="168" r="78" fill="hsl(${hue} 80% 60% / 0.35)"/>
  <circle cx="150" cy="168" r="46" fill="hsl(${hue} 85% 72% / 0.55)"/>
  <text x="150" y="360" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#f2f5f7">${name}</text>
  <text x="150" y="392" text-anchor="middle" font-family="Menlo, monospace" font-size="16" fill="#b3becc">${number}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_FLARES: Omit<DisplayFlare, "imageUrl">[] = [
  {
    cardId: "demo-1",
    cardName: "Roronoa Zoro",
    cardNumber: "OP01-025",
    quantity: 1,
    people: 1,
    askedBy: "Priya",
    storeMayHave: true,
  },
  {
    cardId: "demo-2",
    cardName: "Trafalgar Law",
    cardNumber: "OP05-069",
    quantity: 3,
    people: 3,
    askedBy: null,
    storeMayHave: false,
  },
  {
    cardId: "demo-3",
    cardName: "Nami",
    cardNumber: "OP01-016",
    quantity: 2,
    people: 1,
    askedBy: "Marcus",
    storeMayHave: true,
  },
  {
    cardId: "demo-4",
    cardName: "Boa Hancock",
    cardNumber: "OP07-051",
    quantity: 1,
    people: 1,
    askedBy: "Jules",
    storeMayHave: false,
  },
  {
    cardId: "demo-5",
    cardName: "Monkey.D.Luffy",
    cardNumber: "OP05-119",
    quantity: 1,
    people: 2,
    askedBy: null,
    storeMayHave: true,
  },
];

const HUES = [4, 210, 28, 320, 0];

export function demoFlares(): DisplayFlare[] {
  return SAMPLE_FLARES.map((flare, index) => ({
    ...flare,
    imageUrl: sampleArt(flare.cardName, flare.cardNumber, HUES[index] ?? 200),
  }));
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
