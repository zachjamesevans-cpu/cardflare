import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The launch screen. The founder (2026-10-15): "update the main 'loading'
 * icon like when you open app for first time ... it's the full cardflare
 * logo that we use for the top of feed, and it has that dark gray green
 * background we use throughout the app."
 *
 * Two pictures have to be one: the native launch screen (app.json) and
 * the app's first frames (launch-view.tsx), or the hand-over jumps.
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const app = JSON.parse(read("mobile/app.json")) as {
  expo: { plugins: unknown[] };
};
const splash = (
  app.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  ) as [string, { image: string; imageWidth: number; backgroundColor: string }]
)[1];
const view = read("mobile/src/launch-view.tsx");
const theme = read("mobile/src/theme.ts");

describe("the launch screen", () => {
  it("is the Feed's wordmark on the app's green-grey", () => {
    expect(splash.image).toBe("./assets/wordmark-soft.png");
    expect(read("mobile/src/collapsing-header.tsx")).toContain(
      'require("../assets/wordmark-soft.png")',
    );
    const surface = /soft: \{\s*surface: "(#[0-9a-f]{6})"/.exec(theme)?.[1];
    expect(splash.backgroundColor.toLowerCase()).toBe(surface);
  });

  it("is drawn again, the same, while the app starts", () => {
    expect(view).toContain('require("../assets/wordmark-soft.png")');
    expect(view).toContain(`LAUNCH_WORDMARK_WIDTH = ${splash.imageWidth};`);
    expect(view).toContain("BACKDROPS.green.surface");
    expect(read("mobile/index.ts")).toContain("createElement(LaunchView)");
    expect(read("mobile/App.tsx")).toMatch(
      /gate === "checking"\) \{\s*return <LaunchView \/>;/,
    );
  });
});
