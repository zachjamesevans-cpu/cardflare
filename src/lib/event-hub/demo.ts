import { intermissionFor } from "./auto-mode";
import type { DisplayFlare, DisplayPayload } from "./display-payload";
import { GAME_IDS, GAME_PROFILES, procedureFor, type GameId } from "./game-profiles";
import { LAYOUT_CHOICES, type LayoutChoice } from "./layout";
import {
  advanceTurn,
  callTime,
  impliedOvertimeMs,
  pause,
  start,
  startOvertime,
  type HubTimer,
  type TimerPatch,
} from "./timer";

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
 * A night is a `DemoConfig`: which tournaments are running, where each
 * one is in its round, and the screen's own switches. The scenes the
 * store page offers are named configs, and the switches edit one. Each
 * tournament is reached by the SAME transitions the control panel
 * sends (start, pause, call time, start overtime), so a scene can only
 * show a state a real store's wall can be in.
 *
 * Pure and free of server imports, so the page, the preview route, the
 * switches in the browser and the tests all build the same night.
 */

/** The two scenes the store page used before it had switches. */
export type DemoScene = "focus" | "intermission";

export const DEMO_STORE = "Mox Valley Games";
export const DEMO_NIGHT = "One Piece Locals";
export const DEMO_CODE = "MOX7VG";

/** A screen holds four tournaments before it would have to hide one. */
export const DEMO_MAX_TOURNAMENTS = 4;

const MINUTE = 60_000;
const SECOND = 1_000;

/** Where a tournament is in its round. */
export type DemoMoment =
  | "round"
  | "final"
  | "paused"
  | "time-called"
  | "overtime"
  | "between-rounds"
  | "untimed";

/** The moments a store owner can pick, in the order a round runs. */
export const DEMO_MOMENTS: readonly { id: DemoMoment; label: string }[] = [
  { id: "round", label: "Mid-round" },
  { id: "final", label: "Final minutes" },
  { id: "paused", label: "Paused" },
  { id: "time-called", label: "Time called" },
  { id: "overtime", label: "Extra time" },
  { id: "between-rounds", label: "Between rounds" },
];

const MOMENT_IDS: readonly DemoMoment[] = [
  ...DEMO_MOMENTS.map((moment) => moment.id),
  "untimed",
];

export interface DemoTournament {
  game: GameId;
  moment: DemoMoment;
}

export interface DemoConfig {
  tournaments: DemoTournament[];
  layout: LayoutChoice;
  flares: boolean;
  qr: boolean;
  announcement: boolean;
  beginner: boolean;
}

export interface DemoSceneDef {
  id: string;
  label: string;
  /** Under the television while the scene is on. */
  caption: string;
  config: DemoConfig;
}

const SWITCHES = {
  layout: "auto",
  flares: true,
  qr: true,
  announcement: false,
  beginner: false,
} as const;

/**
 * The scenes, in the order the store page offers them. The first is
 * what the page opens on.
 */
export const DEMO_SCENES: readonly DemoSceneDef[] = [
  {
    id: "locals",
    label: "Friday locals",
    caption:
      "One tournament owns the wall: a clock you can read from the back of the shop, one wanted card at a time, and the code to scan in.",
    config: { ...SWITCHES, tournaments: [{ game: "one-piece", moment: "round" }] },
  },
  {
    id: "two-games",
    label: "Two games at once",
    caption:
      "One Piece and Magic on the same night. Each gets its own clock, round and colour, side by side.",
    config: {
      ...SWITCHES,
      tournaments: [
        { game: "one-piece", moment: "round" },
        { game: "mtg", moment: "round" },
      ],
    },
  },
  {
    id: "big-night",
    label: "Big night",
    caption:
      "Four tournaments on one TV, each at its own point: one running, one paused, one at time, one in extra time. The wanted cards move to a strip.",
    config: {
      ...SWITCHES,
      tournaments: [
        { game: "one-piece", moment: "round" },
        { game: "mtg", moment: "paused" },
        /* Pokémon for the extra time: its procedure has a clock. Lorcana
           counts turns instead, which a grid cell cannot show. */
        { game: "lorcana", moment: "time-called" },
        { game: "pokemon", moment: "overtime" },
      ],
    },
  },
  {
    id: "final-minutes",
    label: "Final minutes",
    caption:
      "Under five minutes, the clock changes colour and says so in words. The room knows without anybody shouting.",
    config: { ...SWITCHES, tournaments: [{ game: "one-piece", moment: "final" }] },
  },
  {
    id: "extra-time",
    label: "Extra time",
    caption:
      "Time is up and the game's own procedure takes over: extra time counts up in red, with the turns tracked on the wall.",
    config: { ...SWITCHES, tournaments: [{ game: "one-piece", moment: "overtime" }] },
  },
  {
    id: "between-rounds",
    label: "Between rounds",
    caption:
      "Auto Mode counts down to the next round and starts it on time, while the wanted cards and your announcement rotate.",
    config: {
      ...SWITCHES,
      announcement: true,
      tournaments: [{ game: "one-piece", moment: "between-rounds" }],
    },
  },
  {
    id: "beginner",
    label: "Beginner night",
    caption:
      "With beginner mode on, time being called brings up the game's end-of-round rules, so new players know what happens next.",
    config: {
      ...SWITCHES,
      beginner: true,
      tournaments: [{ game: "one-piece", moment: "time-called" }],
    },
  },
  {
    id: "top-8",
    label: "Untimed top 8",
    caption:
      "A top cut with no round limit: the clock counts up, so the room still sees how long the table has been playing.",
    config: { ...SWITCHES, tournaments: [{ game: "mtg", moment: "untimed" }] },
  },
];

export function demoSceneById(id: string | undefined): DemoSceneDef | null {
  return DEMO_SCENES.find((scene) => scene.id === id) ?? null;
}

/** The scene a config is, if it is exactly one of them. */
export function matchingScene(config: DemoConfig): DemoSceneDef | null {
  const key = demoConfigQuery(config);
  return DEMO_SCENES.find((scene) => demoConfigQuery(scene.config) === key) ?? null;
}

/*
 * Each tournament in a night starts at a different minute, so two
 * clocks side by side never read the same, and runs a different round.
 * Index 0 is the tournament the single-screen scenes are built on.
 */
const ROUND_BY_INDEX = [3, 2, 4, 1];
const LEFT_BY_INDEX = [14 * MINUTE, 22 * MINUTE, 9 * MINUTE, 31 * MINUTE];
const FINAL_BY_INDEX = [
  4 * MINUTE + 32 * SECOND,
  3 * MINUTE + 17 * SECOND,
  2 * MINUTE + 41 * SECOND,
  4 * MINUTE + 5 * SECOND,
];

function apply(timer: HubTimer, patch: TimerPatch | null): HubTimer {
  return patch ? { ...timer, ...patch } : timer;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}

/** One tournament, at its moment, reached the way a real one would be. */
export function demoTournamentTimer(
  tournament: DemoTournament,
  index: number,
  beginner: boolean,
  now: number,
): HubTimer {
  const profile = GAME_PROFILES[tournament.game];
  const untimed = tournament.moment === "untimed";
  const preset =
    (untimed
      ? profile.presets.find((candidate) => candidate.durationSeconds === null)
      : profile.presets.find((candidate) => candidate.durationSeconds !== null)) ??
    profile.presets[0];
  const duration = untimed ? null : (preset.durationSeconds ?? 50 * 60);
  const full = (duration ?? 0) * SECOND;

  let timer: HubTimer = {
    id: `demo-timer-${index}`,
    displayId: "demo-display",
    position: index,
    game: tournament.game,
    /* Named after its own game, so the wall does not print it twice. */
    eventName: `${profile.shortName} Locals`,
    round: ROUND_BY_INDEX[index] ?? 1,
    format: "Swiss",
    bracket: "swiss",
    presetId: preset.id,
    durationSeconds: duration,
    status: "ready",
    startedAt: null,
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
    beginnerMode: beginner,
    /* On only where it is the point. Auto Mode turns time called and
       extra time into the between-rounds countdown, which would hide
       the very moment those scenes exist to show. */
    autoMode: tournament.moment === "between-rounds",
    autoStart: true,
    intermissionSeconds: 180,
    intermissionExtendedMs: 0,
    autoHeldAt: null,
    timeCalledAt: null,
    controlledBy: null,
    controlledAt: null,
    updatedAt: iso(now),
  };

  const left = Math.min(LEFT_BY_INDEX[index] ?? 14 * MINUTE, full - MINUTE);

  switch (tournament.moment) {
    case "round":
      return apply(timer, start(timer, now - (full - left)));

    case "final":
      return apply(timer, start(timer, now - (full - (FINAL_BY_INDEX[index] ?? 0))));

    case "paused": {
      /* Paused a minute and a half ago with eighteen minutes left. */
      const pausedAt = now - 90 * SECOND;
      timer = apply(timer, start(timer, pausedAt - (full - 18 * MINUTE)));
      return apply(timer, pause(timer, pausedAt));
    }

    case "untimed":
      return apply(timer, start(timer, now - 27 * MINUTE));

    case "time-called":
    case "between-rounds":
    case "overtime": {
      /* Called by hand just before the clock got there, which is how a
         judge calls it. Extra time started a minute later. */
      const calledAt =
        tournament.moment === "overtime" ? now - 150 * SECOND : now - 45 * SECOND;
      timer = apply(timer, start(timer, calledAt + 20 * SECOND - full));
      timer = apply(timer, callTime(timer, calledAt));
      if (tournament.moment !== "overtime") return timer;

      const overtimeAt = now - 95 * SECOND;
      const implied = impliedOvertimeMs(timer);
      timer = apply(
        timer,
        startOvertime(timer, overtimeAt, implied === null ? null : implied / SECOND),
      );
      const turns = procedureFor(profile, timer.bracket).additionalTurns;
      return apply(timer, advanceTurn(timer, turns, 1, now));
    }
  }
}

export function demoPayload(
  config: DemoConfig,
  now: number,
  joinUrl: string,
): DisplayPayload {
  const timers = config.tournaments.map((tournament, index) =>
    demoTournamentTimer(tournament, index, config.beginner, now),
  );

  const single = config.tournaments.length === 1;
  const lead = timers[0];
  const between = lead !== undefined && intermissionFor(lead, now) !== null;

  return {
    displayId: "demo-display",
    storeName: DEMO_STORE,
    nightTitle: single
      ? `${GAME_PROFILES[config.tournaments[0].game].shortName} Locals`
      : "Friday Night",
    layout: config.layout,
    announcement: config.announcement
      ? between
        ? `Pairings for round ${(lead.round ?? 1) + 1} are up at the counter`
        : "Prerelease sign-ups for next weekend are open at the counter"
      : null,
    showFlares: config.flares,
    showQr: config.qr,
    soundEnabled: false,
    joinCode: DEMO_CODE,
    joinUrl,
    timers,
    flares: demoFlares(),
    serverNow: now,
  };
}

/*
 * The config as a query string and back. The query is how the store
 * page first points its television at a night, and how a night is
 * shared as a link; the same parser checks the live messages the page
 * sends afterwards, so nothing reaches the display that could not have
 * been typed into its address bar.
 */

const FLAG_KEYS = ["flares", "qr", "announcement", "beginner"] as const;
const FLAG_PARAM: Record<(typeof FLAG_KEYS)[number], string> = {
  flares: "f",
  qr: "q",
  announcement: "a",
  beginner: "b",
};

export function demoConfigQuery(config: DemoConfig): string {
  const params = new URLSearchParams();
  params.set(
    "t",
    config.tournaments
      .map((tournament) => `${tournament.game}.${tournament.moment}`)
      .join(","),
  );
  params.set("l", config.layout);
  for (const key of FLAG_KEYS) params.set(FLAG_PARAM[key], config[key] ? "1" : "0");
  return params.toString();
}

/** The query for a config: the scene's name when it is one, else the whole of it. */
export function demoSrcQuery(config: DemoConfig): string {
  const scene = matchingScene(config);
  return scene ? `scene=${scene.id}` : demoConfigQuery(config);
}

function isGame(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

function isMoment(value: string): value is DemoMoment {
  return (MOMENT_IDS as readonly string[]).includes(value);
}

function isLayout(value: string): value is LayoutChoice {
  return (LAYOUT_CHOICES as readonly string[]).includes(value);
}

/**
 * A config from query parameters, or null when they do not describe
 * one. Unknown games and moments, a repeated game, and more than four
 * tournaments are refused rather than repaired.
 */
export function parseDemoConfig(
  params: Record<string, string | undefined>,
): DemoConfig | null {
  const scene = params.scene;
  if (scene === "focus") return demoSceneById("locals")!.config;
  if (scene === "intermission") return demoSceneById("between-rounds")!.config;
  const named = demoSceneById(scene);
  if (named) return named.config;

  const list = params.t;
  if (!list) return null;

  const tournaments: DemoTournament[] = [];
  for (const entry of list.split(",")) {
    const [game, moment, extra] = entry.split(".");
    if (extra !== undefined || !game || !moment) return null;
    if (!isGame(game) || !isMoment(moment)) return null;
    if (tournaments.some((tournament) => tournament.game === game)) return null;
    tournaments.push({ game, moment });
  }
  if (tournaments.length < 1 || tournaments.length > DEMO_MAX_TOURNAMENTS) return null;

  const layout = params.l ?? "auto";
  if (!isLayout(layout)) return null;

  const flag = (key: (typeof FLAG_KEYS)[number], fallback: boolean): boolean | null => {
    const raw = params[FLAG_PARAM[key]];
    if (raw === undefined) return fallback;
    return raw === "1" ? true : raw === "0" ? false : null;
  };

  const flares = flag("flares", true);
  const qr = flag("qr", true);
  const announcement = flag("announcement", false);
  const beginner = flag("beginner", false);
  if (flares === null || qr === null || announcement === null || beginner === null) {
    return null;
  }

  return { tournaments, layout, flares, qr, announcement, beginner };
}

/** A config from a message another window sent, checked like a URL. */
export function demoConfigFromMessage(data: unknown): DemoConfig | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as { type?: unknown; query?: unknown };
  if (message.type !== "cardflare-demo" || typeof message.query !== "string")
    return null;
  if (message.query.length > 400) return null;
  return parseDemoConfig(Object.fromEntries(new URLSearchParams(message.query)));
}

/**
 * The handshake. The television says READY once it is listening, and
 * answers PING with READY; the page sends PING once IT is listening.
 * Either side can hydrate first, so whichever is second still hears.
 */
export const DEMO_READY = "cardflare-demo-ready";
export const DEMO_PING = "cardflare-demo-ping";

/** The message the store page sends its television. */
export function demoMessage(config: DemoConfig): {
  type: "cardflare-demo";
  query: string;
} {
  return { type: "cardflare-demo", query: demoConfigQuery(config) };
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
    storeMayHave: false,
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
    storeMayHave: false,
  },
];

export function demoFlares(): DisplayFlare[] {
  return DEMO_FLARES.map((flare) => ({ ...flare }));
}

/** The tournament behind one of the two original scenes. */
export function demoTimer(scene: DemoScene, now: number): HubTimer {
  const config = parseDemoConfig({ scene })!;
  return demoTournamentTimer(config.tournaments[0], 0, config.beginner, now);
}

export function demoDisplayPayload(
  scene: DemoScene,
  now: number,
  joinUrl: string,
): DisplayPayload {
  return demoPayload(parseDemoConfig({ scene })!, now, joinUrl);
}

/** The moment the sample night is built around: the request's clock. */
export function demoNow(): number {
  return Date.now();
}

export function isDemoScene(value: string | undefined): value is DemoScene {
  return value === "focus" || value === "intermission";
}
