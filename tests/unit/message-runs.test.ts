import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as web from "@/lib/local/message-runs";
import * as app from "../../mobile/src/message-runs";

/**
 * Conversations drawn Instagram's way, the same on both platforms. The
 * founder: "Profile pic should be shown on every message from someone in
 * a small circle... Do not show own profile pic in messages." And: "if
 * you press enter a bunch, it goes infinitely scrolling and bigger."
 */

const t = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 6, 12, minutes)).toISOString();

for (const [name, lib] of [
  ["website", web],
  ["app", app],
] as const) {
  describe(`message runs on the ${name}`, () => {
    it("puts their face beside the last of each run, never beside yours", () => {
      const flags = lib.messageRuns([
        { yours: false, sentAt: t(0) },
        { yours: false, sentAt: t(1) },
        { yours: true, sentAt: t(2) },
        { yours: true, sentAt: t(3) },
        { yours: false, sentAt: t(4) },
      ]);
      expect(flags.map((f) => f.showFace)).toEqual([false, true, false, false, true]);
      expect(flags.map((f) => f.joinsNext)).toEqual([true, false, true, false, false]);
    });

    it("shows the time only at the start and after a pause", () => {
      const flags = lib.messageRuns([
        { yours: false, sentAt: t(0) },
        { yours: false, sentAt: t(5) },
        { yours: false, sentAt: t(40) },
      ]);
      expect(flags.map((f) => f.showTime)).toEqual([true, false, true]);
      /* A pause also ends the run, so the face shows before it. */
      expect(flags.map((f) => f.showFace)).toEqual([false, true, true]);
    });

    it("sends no blank lines piled at either end", () => {
      expect(lib.tidyMessage("\n\n hello\nthere \n\n\n")).toBe("hello\nthere");
      expect(lib.tidyMessage("\n\n\n")).toBe("");
      expect(lib.COMPOSER_MAX_LINES).toBe(5);
    });
  });
}

describe("the two files", () => {
  it("are the same code", () => {
    const strip = (text: string) => text.slice(text.indexOf("/** A pause this long"));
    expect(strip(readFileSync("mobile/src/message-runs.ts", "utf8"))).toBe(
      strip(readFileSync("src/lib/local/message-runs.ts", "utf8")),
    );
  });
});
