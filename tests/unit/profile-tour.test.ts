import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PROFILE_TOUR, tourCount } from "../../src/lib/onboarding/intro";

/**
 * The profile tour. The founder: "i think we need another similar vibe,
 * but when people click the profile for the first time", then "build it
 * go" on four stops - and, on the last stop's ring: "it's kinda cropped
 * and chopped a bit. make it highlight the edges a bit more accurately."
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("the profile tour", () => {
  it("is four stops, in order", () => {
    expect(PROFILE_TOUR.map((stop) => stop.key)).toEqual([
      "binders",
      "share",
      "wand",
      "tabs",
    ]);
    expect(tourCount(0)).toBe("1 of 4");
  });

  it("points at the real things on the app's Profile", () => {
    const profile = read("mobile/src/screens/profile.tsx");
    expect(profile).toContain('useTourTarget("binders")');
    expect(profile).toContain('useTourTarget("share")');
    expect(profile).toContain('useTourTarget("wand")');
    expect(profile).toContain("<ProfileTour />");
    expect(read("mobile/src/profile-tabs.tsx")).toContain('useTourTarget("tabs")');
  });

  it("points at the same things on the website's Profile", () => {
    const page = read("src/app/profile/page.tsx");
    for (const key of ["binders", "share", "wand"]) {
      expect(page, key).toContain(`data-tour="${key}"`);
    }
    expect(page).toContain("<ProfileTour />");
    expect(read("src/components/players/profile-tabs.tsx")).toContain(
      'data-tour="tabs"',
    );
  });

  it("keeps a row's ring inside the screen, so no side is cut off", () => {
    expect(read("mobile/src/profile-tour.tsx")).toContain(
      "const right = Math.min(screenWidth - EDGE, x + width + PAD);",
    );
    expect(read("src/components/onboarding/profile-tour.tsx")).toContain(
      "const right = Math.min(window.innerWidth - EDGE, box.right + PAD);",
    );
  });

  it("is queued for a new player when the intro ends, never for an update", () => {
    const app = read("mobile/App.tsx");
    expect(app).toContain(
      'if (end === "look" || end === "post") void queueProfileTour();',
    );
    const cards = read("src/components/onboarding/intro-cards.tsx");
    expect(cards.match(/onClick=\{noteProfileTour\}/g)).toHaveLength(3);
  });

  it("can be replayed from Help on both platforms", () => {
    expect(read("mobile/src/screens/settings.tsx")).toContain(
      "label={REPLAY_TOUR_LABEL}",
    );
    expect(read("src/app/profile/settings/settings-content.tsx")).toContain(
      '{ href: "/profile?tour=profile", label: REPLAY_TOUR_LABEL }',
    );
  });

  it("lets taps through the app's dim to what is under it", () => {
    /* A Skia canvas took the taps meant for "tap anywhere to go on". */
    expect(read("mobile/src/spotlight.tsx")).toMatch(
      /<View style=\{StyleSheet\.absoluteFill\} pointerEvents="none">\s*<Canvas/,
    );
  });
});
