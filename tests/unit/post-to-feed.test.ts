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
    expect(hub).toContain("if (!complete) return false;");
    expect(hub).toContain("navigationRef.dispatch(StackActions.popToTop());");
    expect(hub).toMatch(/screen: "Feed", params: \{ posted: Date\.now\(\) \}/);
    const composer = read("mobile/src/screens/flare-composer.tsx");
    expect(composer).toContain("if (!left) setPosted({");
    expect(read("mobile/src/screens/home.tsx")).toContain(
      "if (arrival) feedScroll.current?.scrollTo({ y: 0, animated: false });",
    );
  });

  it("on the website: a complete post goes to /feed", () => {
    const composer = read("src/components/flares/flare-composer.tsx");
    expect(composer).toMatch(
      /if \(result\.posted === result\.total\) \{\s*router\.push\("\/feed"\);/,
    );
  });
});
