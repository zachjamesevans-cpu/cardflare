import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { INTRO_CARDS } from "../../src/lib/onboarding/intro";

/**
 * A new player's first run. The founder (2026-10-15): "id like a quick
 * 30 second introduction to the app when people first sign up - such
 * as highlighting the post a flare button, a quick 30 word summary or
 * something", then "yes build all suggestions go": the intro, the
 * spotlight on the +, "Replay the intro", the sign-up preview in demo
 * mode, the website's copy of all of it, and the optional ZIP step.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("the intro's words", () => {
  it("are one file on both platforms", () => {
    expect(read("mobile/src/intro-copy.ts")).toBe(read("src/lib/onboarding/intro.ts"));
  });

  it("are three cards and about thirty words", () => {
    expect(INTRO_CARDS.map((card) => card.key)).toEqual(["post", "nearby", "trade"]);
    const words = INTRO_CARDS.flatMap((card) =>
      `${card.title} ${card.body}`.split(/\s+/),
    );
    expect(words.length).toBeLessThanOrEqual(30);
  });
});

describe("the app's sign-up", () => {
  const welcome = read("mobile/src/screens/welcome.tsx");

  it("goes account, games, where, intro", () => {
    expect(welcome).toContain(
      '<AccountStep preview={preview} onDone={() => setStep("games")} />',
    );
    expect(welcome).toContain(
      '<GamesStep preview={preview} onDone={() => setStep("where")} />',
    );
    expect(welcome).toContain(
      '<WhereStep preview={preview} onDone={() => setStep("intro")} />',
    );
    expect(welcome).toContain(
      '<Intro onPost={() => done("post")} onLook={() => done("look")} />',
    );
  });

  it("shows no intro to somebody signing in or browsing", () => {
    expect(welcome).toContain("onSignedIn={() => done()}");
    expect(welcome).toContain("onSkip={() => done()}");
  });

  it("creates and saves nothing in the preview", () => {
    expect(welcome).toMatch(
      /if \(preview\) \{\s*onDone\(\);\s*return;\s*\}\s*const result = await signUp/,
    );
    expect(welcome).toMatch(
      /if \(preview\) \{\s*onDone\(\);\s*return;\s*\}\s*\/\*\s*\* A failed save/,
    );
    expect(welcome).toContain("dryRun={preview}");
    expect(welcome).toContain("if (!preview) void markWelcomeSeen();");
    const ask = read("mobile/src/nearby-location-ask.tsx");
    expect(ask.match(/if \(dryRun\) \{\s*onDone\(\);\s*return;\s*\}/g)).toHaveLength(2);
  });

  it("follows the intro's answer: the composer, or the Feed with the + pointed at", () => {
    const app = read("mobile/App.tsx");
    expect(app).toContain('go("Tabs", { screen: "Flare" });');
    expect(app).toMatch(
      /void queueSpotlight\(\);\s*go\("Tabs", \{ screen: "Feed" \}\);/,
    );
    expect(app).toContain('if (afterWelcome === "post") {');
  });
});

describe("the spotlight on the +", () => {
  it("rings the Feed's + on the app", () => {
    expect(read("mobile/src/collapsing-header.tsx")).toContain(
      "<View ref={postTarget} collapsable={false}>",
    );
    expect(read("mobile/src/screens/home.tsx")).toContain(
      '<Spotlight onOpen={() => navigation.navigate("Tabs", { screen: "Flare" })} />',
    );
    /* Once, and only when queued by the intro. */
    const spot = read("mobile/src/spotlight.tsx");
    expect(spot).toContain("await SecureStore.deleteItemAsync(PENDING_KEY);");
  });

  it("rings the Feed's + on the website", () => {
    const feed = read("src/app/feed/page.tsx");
    expect(feed).toContain('data-spotlight="post-flare"');
    expect(feed).toContain("{tour && <PostSpotlight />}");
    expect(read("src/components/onboarding/intro-cards.tsx")).toContain(
      'const LOOK_HREF = "/feed?tour=post";',
    );
  });
});

describe("the website's sign-up", () => {
  it("goes games, where, intro", () => {
    expect(read("src/lib/players/games-actions.ts")).toContain(
      'redirect("/welcome/where");',
    );
    const where = read("src/app/welcome/where/page.tsx");
    expect(where).toContain('href="/welcome/intro"');
    expect(where).toContain("<PostalAsk");
    expect(read("src/app/welcome/intro/page.tsx")).toContain("<IntroCards />");
  });
});

describe("again, later", () => {
  it("is in Help on both platforms", () => {
    expect(read("mobile/src/screens/settings.tsx")).toContain(
      '<Row label={REPLAY_LABEL} onPress={() => navigation.navigate("Intro")} />',
    );
    expect(read("src/app/profile/settings/settings-content.tsx")).toContain(
      '{ href: "/welcome/intro", label: REPLAY_LABEL },',
    );
  });

  it("is a demo shot that walks the whole sign-up", () => {
    expect(read("mobile/src/screens/demo-shots.tsx")).toContain(
      'go: (nav) => nav.navigate("SignUpPreview"),',
    );
    expect(read("mobile/App.tsx")).toMatch(
      /name="SignUpPreview"[\s\S]{0,200}<WelcomeScreen\s+preview/,
    );
  });
});
