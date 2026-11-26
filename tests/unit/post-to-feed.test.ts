import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-25): "when you post a flare, it should immediately
 * automatically take you to the main feed with your flare there, no need
 * to have that entire secondary menu." A post that only partly went up
 * keeps its panel, so "2 of 3 went up" is still read.
 */
describe("posting a Flare lands on the Feed", () => {
  it("on the app: closes what is open over the tabs, then the Feed at its top", () => {
    const hub = read("mobile/src/screens/hub.tsx");
    /* Every post, a partial one too: its note goes to the Feed's line. */
    expect(hub).not.toContain("if (!complete) return false;");
    expect(hub).toContain(
      'toTab(navigationRef, "Feed", { posted: Date.now(), postedNote: summary ?? undefined });',
    );
    expect(read("mobile/src/screens/home.tsx")).toContain(
      '{state === "posting" ? "Posting your Flare…" : "Your Flare is up"}',
    );
    expect(hub).toContain("navigationRef.dispatch(StackActions.popToTop());");
    const composer = read("mobile/src/screens/flare-composer.tsx");
    expect(composer).toContain("if (!left) setPosted({");
    /* The list's top is -headerRoom (it starts under the header). */
    expect(read("mobile/src/screens/home.tsx")).toContain(
      "scrollTo({ y: -headerRoom, animated })",
    );
  });

  it("on the website: every post goes to /feed, which says it is up", () => {
    const composer = read("src/components/flares/flare-composer.tsx");
    expect(composer).toContain(
      'note ? `/feed?posted=1&note=${encodeURIComponent(note)}` : "/feed?posted=1"',
    );
    expect(composer).not.toContain("See it in the Feed");
    expect(read("src/app/feed/page.tsx")).toContain("<PostedLine />");
    expect(read("src/components/feed/posted-line.tsx")).toContain("Your Flare is up");
  });
});

describe("back to the one tab bar", () => {
  /* "the feed is not a slide up menu": React Navigation 7 pushed a second
     Tabs over a sheet on a plain navigate; toTab pops back instead. */
  it("goes to a tab by popping back, from every screen over the tabs", () => {
    expect(read("mobile/src/to-tab.ts")).toContain("pop: true,");
    for (const file of [
      "mobile/src/follow-href.ts",
      "mobile/src/screens/settings.tsx",
      "mobile/src/screens/game-hub.tsx",
      "mobile/src/screens/hub.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/navigation\.navigate\("Tabs"/);
    }
  });
});
