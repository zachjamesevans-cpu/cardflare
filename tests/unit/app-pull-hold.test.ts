import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Feed's pull to refresh, and the logo it sits under.
 *
 * The founder (2026-10-12): "the refresh loading circle thing cuts off
 * the logo and is over everything. when refreshing, it should 'hang' at
 * the top of the screen and it won't go back to normal view until its
 * done refreshing. also, the logo that's like the startup logo needs to
 * be the new logo png, it still has the old card logo."
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const home = read("mobile/src/screens/home.tsx");

describe("pull to refresh on the Feed", () => {
  it("holds the content down with a spacer while the load runs", () => {
    expect(home).toMatch(/hold\.value = withTiming\(PULL_HOLD/);
    expect(home).toMatch(/hold\.value = withTiming\(0/);
    /* The spacer is the list's first child, so it pushes the posts down. */
    expect(home).toMatch(
      />\s*\{\/\* The hold[^}]*\*\/\}\s*<Animated\.View style=\{holdStyle\} \/>/,
    );
    /* A changed inset does not move the content in this app. */
    expect(home).toContain("contentInset={{ top: headerRoom }}");
  });

  it("keeps the spinner in the gap, not over a post", () => {
    expect(home).toContain("const gap = pull.value + hold.value;");
    expect(home).toMatch(/translateY: Math\.max\(0, \(gap - SPINNER_SIZE\) \/ 2\)/);
  });

  it("stays refreshing until the content has slid home", () => {
    const refresh = home.slice(home.indexOf("const refresh = async () => {"));
    const close = refresh.indexOf("hold.value = withTiming(0");
    expect(close).toBeGreaterThan(0);
    expect(refresh.indexOf("setRefreshing(false)")).toBeGreaterThan(close);
  });
});

describe("the logo", () => {
  it("is the CF mark wherever the app draws it, not the flame card", () => {
    /* welcome.tsx keeps the flame card only on the "lime" side of its
       BRAND switch, which is how the old look goes back in one line. */
    expect(read("mobile/src/screens/welcome.tsx")).toMatch(
      /BRAND === "soft" \? \([\s\S]*?source=\{CF_MARK\}/,
    );
    for (const file of ["mobile/src/screens/home.tsx", "mobile/src/pack-shop.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /require\("[./]+\/assets\/cardflare-mark\.png"\)\}/,
      );
      expect(source, file).toContain("cf-mark.png");
    }
    expect(read("mobile/app.json")).toContain('"image": "./assets/splash-icon.png"');
  });
});
