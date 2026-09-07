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

  it("draws its own card art rather than borrowing a publisher's", () => {
    for (const flare of demoFlares()) {
      expect(flare.imageUrl).toMatch(/^data:image\/svg\+xml/);
    }
    expect(demoFlares().some((flare) => flare.storeMayHave)).toBe(true);
  });

  it("points the code on screen back at the store page", () => {
    const payload = demoDisplayPayload("focus", now, "https://cardflare.gg/for-stores");
    expect(payload.joinUrl).toBe("https://cardflare.gg/for-stores");
    expect(payload.layout).toBe("single");
    expect(payload.timers).toHaveLength(1);
  });
});
