import { afterEach, describe, expect, it } from "vitest";

import { composerMode } from "@/lib/lists/composer-mode";

/**
 * The switch between the two Flare composers.
 *
 * Worth its own test because of how it gets used: the way back to the
 * two-step flow is somebody typing a value into Vercel under pressure,
 * and every wrong value has to land on the inline composer rather than
 * on something broken. A typo must be inert, not fatal.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_FLARE_COMPOSER;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_FLARE_COMPOSER;
  else process.env.NEXT_PUBLIC_FLARE_COMPOSER = ORIGINAL;
});

describe("composerMode", () => {
  it("runs the inline composer when nothing is set", () => {
    delete process.env.NEXT_PUBLIC_FLARE_COMPOSER;

    expect(composerMode()).toBe("inline");
  });

  it("goes back to the two-step flow on exactly 'confirm'", () => {
    process.env.NEXT_PUBLIC_FLARE_COMPOSER = "confirm";

    expect(composerMode()).toBe("confirm");
  });

  /*
   * The failure mode that matters. Someone reaching for the old flow in
   * a hurry types "Confirm", or leaves a space, or writes "two-step" —
   * and none of those may take the app somewhere neither composer
   * handles. They land on the default and the app keeps working.
   */
  it("treats anything else as the default rather than as an error", () => {
    for (const value of ["Confirm", " confirm", "confirm ", "two-step", "inline", ""]) {
      process.env.NEXT_PUBLIC_FLARE_COMPOSER = value;

      expect(composerMode()).toBe("inline");
    }
  });
});
