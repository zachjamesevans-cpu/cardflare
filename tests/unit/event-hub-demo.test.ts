import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { intermissionFor } from "@/lib/event-hub/auto-mode";
import { demoDisplayPayload, demoFlares, demoTimer } from "@/lib/event-hub/demo";
import { remainingMs, timerPhase } from "@/lib/event-hub/timer";

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
    expect(payload.layout).toBe("single");
    expect(payload.timers).toHaveLength(1);
  });
});
