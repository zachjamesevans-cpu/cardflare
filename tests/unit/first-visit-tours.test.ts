import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TOUR_IDS, TOURS, tourCount } from "../../src/lib/onboarding/intro";

/**
 * The first-visit tours. The founder: "i think we need another similar
 * vibe, but when people click the profile for the first time" (four
 * stops on the Profile), "it's kinda cropped and chopped a bit. make it
 * highlight the edges a bit more accurately" (the rows' rings), then
 * "build 1-3 go": a store room, your own binder, Nearby.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("the tours", () => {
  it("are four, three or four stops each", () => {
    expect(TOUR_IDS).toEqual(["profile", "room", "binder", "nearby"]);
    expect(TOURS.profile.map((stop) => stop.key)).toEqual([
      "binders",
      "share",
      "wand",
      "tabs",
    ]);
    expect(TOURS.room.map((stop) => stop.key)).toEqual(["board", "yours", "add"]);
    expect(TOURS.binder.map((stop) => stop.key)).toEqual([
      "pockets",
      "share",
      "settings",
    ]);
    expect(TOURS.nearby.map((stop) => stop.key)).toEqual(["wanted", "location"]);
    for (const id of TOUR_IDS) expect(TOURS[id].length).toBeLessThanOrEqual(4);
    expect(tourCount(0, 3)).toBe("1 of 3");
  });

  it("never point at the room's open-to-trades switch, which a player does not see there", () => {
    expect(TOURS.room.map((stop) => stop.key)).not.toContain("trades");
  });
});

describe("the app's targets", () => {
  it("are marked on every screen with a tour", () => {
    const profile = read("mobile/src/screens/profile.tsx");
    for (const key of ["binders", "share", "wand"]) {
      expect(profile, key).toContain(`useTourTarget("profile", "${key}")`);
    }
    expect(read("mobile/src/profile-tabs.tsx")).toContain(
      'useTourTarget("profile", "tabs")',
    );
    const room = read("mobile/src/screens/room.tsx");
    for (const key of ["board", "yours", "add"]) {
      expect(room, key).toContain(`useTourTarget("room", "${key}")`);
    }
    expect(room).toContain("ref={mine ? tourYours : undefined}");
    const binder = read("mobile/src/screens/binder.tsx");
    for (const key of ["pockets", "share", "settings"]) {
      expect(binder, key).toContain(`useTourTarget("binder", "${key}")`);
    }
    const home = read("mobile/src/screens/home.tsx");
    for (const key of ["wanted", "location"]) {
      expect(home, key).toContain(`useTourTarget("nearby", "${key}")`);
    }
  });

  it("show each tour on its own screen, the binder's only while it is empty", () => {
    expect(read("mobile/src/screens/profile.tsx")).toContain("<ProfileTour />");
    expect(read("mobile/src/screens/room.tsx")).toContain('<Tour id="room" />');
    expect(read("mobile/src/screens/binder.tsx")).toContain(
      '<Tour id="binder" when={binder.yours && binder.count === 0} />',
    );
    expect(read("mobile/src/screens/home.tsx")).toContain(
      '{mode === "nearby" && !guest ? <Tour id="nearby" /> : null}',
    );
  });
});

describe("the website's targets", () => {
  it("are marked on every page with a tour", () => {
    const page = read("src/app/profile/page.tsx");
    for (const key of ["binders", "share", "wand"]) {
      expect(page, key).toContain(`data-tour="profile:${key}"`);
    }
    expect(read("src/components/players/profile-tabs.tsx")).toContain(
      'data-tour="profile:tabs"',
    );
    expect(read("src/components/events/flares-at-night.tsx")).toContain(
      'data-tour="room:board"',
    );
    expect(read("src/components/lists/list-entries.tsx")).toContain(
      'tour={isYou ? "room:yours" : undefined}',
    );
    expect(read("src/components/events/flare-fab.tsx")).toContain(
      'data-tour="room:add"',
    );
    const binder = read("src/components/binder/binder-page.tsx");
    for (const key of ["pockets", "share", "settings"]) {
      expect(binder, key).toContain(`data-tour="binder:${key}"`);
    }
    expect(binder).toContain(
      '<Tour id="binder" when={binder.yours && binder.count === 0} />',
    );
    const local = read("src/components/local/local-screen.tsx");
    expect(local).toContain('data-tour="nearby:wanted"');
    expect(local).toContain('tour="nearby:location"');
    expect(local).toContain('<Tour id="nearby" />');
    expect(read("src/app/e/[code]/page.tsx")).toContain('<Tour id="room" />');
  });
});

describe("the rules", () => {
  it("keep a row's ring inside the screen, so no side is cut off", () => {
    expect(read("mobile/src/tour.tsx")).toContain(
      "const right = Math.min(screenWidth - EDGE, x + width + PAD);",
    );
    expect(read("src/components/onboarding/tour.tsx")).toContain(
      "const right = Math.min(window.innerWidth - EDGE, box.right + PAD);",
    );
  });

  it("queue every tour for a new player when the intro ends, never for an update", () => {
    expect(read("mobile/App.tsx")).toContain(
      'if (end === "look" || end === "post") void queueTours();',
    );
    const cards = read("src/components/onboarding/intro-cards.tsx");
    expect(cards.match(/onClick=\{noteTours\}/g)).toHaveLength(3);
  });

  it("pass over a stop with nothing on the screen, quickly", () => {
    expect(read("mobile/src/tour.tsx")).toContain(
      "if (tries >= 4 && !targets.get(at_)?.current) break;",
    );
  });

  it("replay from one line in Help, on both platforms", () => {
    expect(read("mobile/src/screens/settings.tsx")).toContain(
      "label={REPLAY_TIPS_LABEL}",
    );
    expect(read("src/app/profile/settings/settings-content.tsx")).toContain(
      '{ href: "/profile?tour=all", label: REPLAY_TIPS_LABEL }',
    );
  });

  it("let taps through the app's dim to what is under it", () => {
    expect(read("mobile/src/spotlight.tsx")).toMatch(
      /<View style=\{StyleSheet\.absoluteFill\} pointerEvents="none">\s*<Canvas/,
    );
  });
});
