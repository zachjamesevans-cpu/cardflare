import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { intermissionFor } from "@/lib/event-hub/auto-mode";
import {
  DEMO_SCENES,
  demoConfigFromMessage,
  demoConfigQuery,
  demoDisplayPayload,
  demoFlares,
  demoMessage,
  demoPayload,
  demoSceneById,
  demoSrcQuery,
  demoTimer,
  matchingScene,
  parseDemoConfig,
  type DemoConfig,
} from "@/lib/event-hub/demo";
import { displayPlan } from "@/lib/event-hub/layout";
import {
  overtimeElapsedMs,
  remainingMs,
  showsOvertimeRules,
  timerPhase,
  urgency,
} from "@/lib/event-hub/timer";

/**
 * The sample night behind the store page's previews is arithmetic
 * against now, like a real row, so the pictures move. These hold the
 * two scenes to what the captions beside them promise.
 */
describe("the sample night", () => {
  const now = Date.parse("2026-09-07T02:00:00Z");

  it("is mid-round with fourteen minutes on the clock in the focus scene", () => {
    const timer = demoTimer("focus", now);
    expect(timerPhase(timer, now)).toBe("running");
    expect(remainingMs(timer, now)).toBe(14 * 60_000);
    expect(intermissionFor(timer, now)).toBeNull();
  });

  it("is between rounds, counting down to round 4, in the intermission scene", () => {
    const timer = demoTimer("intermission", now);
    const intermission = intermissionFor(timer, now);
    expect(intermission?.state).toBe("counting");
    expect(intermission?.nextRound).toBe(4);
    expect(intermission?.remainingMs).toBe(135_000);
  });

  it("hunts the three cards the founder picked, each with its trimmed art", () => {
    const flares = demoFlares();
    expect(flares.map((flare) => [flare.cardName, flare.cardNumber])).toEqual([
      ["Trafalgar Law", "OP14-009"],
      ["Nami", "OP15-086"],
      ["Boa Hancock", "OP07-051"],
    ]);
    for (const flare of flares) {
      const file = `/flarecast/${flare.cardNumber.toLowerCase()}.webp`;
      expect(flare.imageUrl).toBe(file);
      expect(existsSync(join(process.cwd(), "public", file))).toBe(true);
    }
    /* The founder: the "Store may have" band on the sample cards "looks
       ugly". The preview shows the art clean. */
    expect(flares.some((flare) => flare.storeMayHave)).toBe(false);
  });

  it("points the code on screen back at the store page", () => {
    const payload = demoDisplayPayload("focus", now, "https://cardflare.gg/ultra");
    expect(payload.joinUrl).toBe("https://cardflare.gg/ultra");
    expect(displayPlan(payload.layout, payload.timers.length).layout).toBe("single");
    expect(payload.timers).toHaveLength(1);
  });
});

/**
 * The scenes the store page offers. Each caption makes a promise about
 * what is on the wall; these hold the night to it.
 */
describe("the demo scenes", () => {
  const now = Date.parse("2026-09-07T02:00:00Z");
  const night = (id: string) => {
    const scene = demoSceneById(id);
    if (!scene) throw new Error(`no scene ${id}`);
    return demoPayload(scene.config, now, "https://cardflare.gg/ultra");
  };
  const layoutOf = (id: string) => {
    const payload = night(id);
    return displayPlan(payload.layout, payload.timers.length).layout;
  };

  it("opens on Friday locals, one tournament mid-round", () => {
    expect(DEMO_SCENES[0].id).toBe("locals");
    const [timer] = night("locals").timers;
    expect(timerPhase(timer, now)).toBe("running");
    expect(layoutOf("locals")).toBe("single");
  });

  it("puts One Piece and Magic side by side, on different clocks", () => {
    const { timers } = night("two-games");
    expect(timers.map((timer) => timer.game)).toEqual(["one-piece", "mtg"]);
    expect(layoutOf("two-games")).toBe("split");
    expect(remainingMs(timers[0], now)).not.toBe(remainingMs(timers[1], now));
  });

  it("runs four tournaments at four different points on a big night", () => {
    const { timers } = night("big-night");
    expect(layoutOf("big-night")).toBe("grid");
    expect(timers.map((timer) => timerPhase(timer, now))).toEqual([
      "running",
      "paused",
      "time_called",
      "overtime",
    ]);
  });

  it("is under five minutes in the final minutes, on every clock", () => {
    const [timer] = night("final-minutes").timers;
    expect(urgency(timer, now)).toBe("five");

    const four = demoPayload(
      {
        ...demoSceneById("final-minutes")!.config,
        tournaments: (["one-piece", "mtg", "pokemon", "lorcana"] as const).map(
          (game) => ({
            game,
            moment: "final" as const,
          }),
        ),
      },
      now,
      "https://cardflare.gg/ultra",
    ).timers;
    expect(four.map((clock) => urgency(clock, now))).toEqual([
      "five",
      "five",
      "five",
      "five",
    ]);
    expect(new Set(four.map((clock) => remainingMs(clock, now))).size).toBe(4);
  });

  it("counts extra time up, with a turn already taken", () => {
    const [timer] = night("extra-time").timers;
    expect(timerPhase(timer, now)).toBe("overtime");
    expect(overtimeElapsedMs(timer, now)).toBe(95_000);
    expect(timer.overtimeTurn).toBe(1);
  });

  it("counts down to the next round, with the pairings announced", () => {
    const payload = night("between-rounds");
    expect(intermissionFor(payload.timers[0], now)?.state).toBe("counting");
    expect(payload.announcement).toMatch(/round 4/);
  });

  it("brings the rules card up on beginner night", () => {
    const [timer] = night("beginner").timers;
    expect(showsOvertimeRules(timer, now)).toBe(true);
  });

  it("counts an untimed top 8 up", () => {
    const [timer] = night("top-8").timers;
    expect(timer.durationSeconds).toBeNull();
    expect(timerPhase(timer, now)).toBe("running");
  });

  it("keeps Auto Mode off except between rounds, so time and extra time show", () => {
    for (const scene of DEMO_SCENES) {
      for (const timer of night(scene.id).timers) {
        expect(intermissionFor(timer, now) !== null).toBe(
          scene.config.tournaments[timer.position].moment === "between-rounds",
        );
      }
    }
  });
});

describe("a demo night as a link", () => {
  const custom: DemoConfig = {
    tournaments: [
      { game: "pokemon", moment: "final" },
      { game: "riftbound", moment: "paused" },
      { game: "flesh-and-blood", moment: "overtime" },
    ],
    layout: "grid",
    flares: false,
    qr: true,
    announcement: true,
    beginner: false,
  };
  const parse = (query: string) =>
    parseDemoConfig(Object.fromEntries(new URLSearchParams(query)));

  it("round-trips any night through its query", () => {
    expect(parse(demoConfigQuery(custom))).toEqual(custom);
    for (const scene of DEMO_SCENES) {
      expect(parse(demoConfigQuery(scene.config))).toEqual(scene.config);
    }
  });

  it("names a scene by its id, and a custom night in full", () => {
    expect(demoSrcQuery(DEMO_SCENES[1].config)).toBe("scene=two-games");
    expect(matchingScene(custom)).toBeNull();
    expect(demoSrcQuery(custom)).toBe(demoConfigQuery(custom));
  });

  it("still understands the two scenes the page linked before", () => {
    expect(parseDemoConfig({ scene: "focus" })).toEqual(
      demoSceneById("locals")!.config,
    );
    expect(parseDemoConfig({ scene: "intermission" })).toEqual(
      demoSceneById("between-rounds")!.config,
    );
  });

  it("refuses what it does not recognise rather than repairing it", () => {
    for (const bad of [
      "t=chess.round",
      "t=mtg.sleeping",
      "t=mtg.round,mtg.paused",
      "t=mtg.round.extra",
      "t=",
      "t=one-piece.round,mtg.round,pokemon.round,lorcana.round,riftbound.round",
      "t=mtg.round&l=huge",
      "t=mtg.round&f=yes",
      "scene=nope",
    ]) {
      expect(parse(bad), bad).toBeNull();
    }
  });

  it("accepts only its own message shape from another window", () => {
    expect(demoConfigFromMessage(demoMessage(custom))).toEqual(custom);
    expect(demoConfigFromMessage({ type: "other", query: "t=mtg.round" })).toBeNull();
    expect(demoConfigFromMessage("t=mtg.round")).toBeNull();
    expect(
      demoConfigFromMessage({
        type: "cardflare-demo",
        query: "t=mtg.round&x=" + "a".repeat(500),
      }),
    ).toBeNull();
  });
});
