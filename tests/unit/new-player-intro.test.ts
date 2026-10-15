import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";

import { INTRO_ART, INTRO_CARDS, introGame } from "../../src/lib/onboarding/intro";

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
    expect(welcome).toMatch(
      /<GamesStep\s+preview=\{preview\}\s+onDone=\{\(picked\) => \{\s*setPlayed\(picked\);\s*setStep\("where"\);/,
    );
    expect(welcome).toContain(
      '<WhereStep preview={preview} onDone={() => setStep("intro")} />',
    );
    expect(welcome).toMatch(
      /<Intro\s+game=\{introGame\(played\)\}\s+onPost=\{\(\) => done\("post"\)\}\s+onLook=\{\(\) => done\("look"\)\}/,
    );
  });

  it("shows no intro to somebody signing in or scanning into a store", () => {
    expect(welcome).toContain("onSignedIn={() => done()}");
    expect(welcome).toContain('onScan={() => done("scan")}');
  });

  it("creates and saves nothing in the preview", () => {
    expect(welcome).toMatch(
      /if \(preview\) \{\s*onDone\(\);\s*return;\s*\}\s*const result = await signUp/,
    );
    expect(welcome).toMatch(
      /if \(preview\) \{\s*onDone\(\[\.\.\.picked\]\);\s*return;\s*\}\s*\/\*\s*\* A failed save/,
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
    expect(app).toContain(
      'afterWelcome = end === "post" || end === "scan" ? end : null;',
    );
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
    expect(read("src/app/welcome/intro/page.tsx")).toContain(
      "<IntroCards game={game} />",
    );
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

/*
 * The founder: "the big screen that shows all the big icons ... isn't
 * enough. maybe a screenshot of the app or something for each of those
 * things", then "build it go" on drawing small scenes of the app.
 */
/* "the 'who have them raise a hand' verbiage is a bit odd ... people
   should be able to swipe between these screens ... go back and forth." */
describe("the intro's cards", () => {
  it("say the second one plainly", () => {
    const nearby = INTRO_CARDS.find((card) => card.key === "nearby");
    expect(nearby?.title).toBe("Find it nearby");
    expect(nearby?.body).toBe("See who near you has the card you want.");
  });

  it("swipe both ways, one at a time, on both platforms", () => {
    const app = read("mobile/src/intro.tsx");
    expect(app).toContain("pagingEnabled");
    expect(app).toContain("disableIntervalMomentum");
    expect(app).toContain("onPress={() => go(index + 1)}");
    const web = read("src/components/onboarding/intro-cards.tsx");
    expect(web).toContain("snap-x snap-mandatory");
    expect(web).toContain('if (event.key === "ArrowLeft") go(index - 1);');
    expect(web).toContain("onClick={() => go(index + 1)}");
  });
});

describe("the intro's scenes", () => {
  it("are on both platforms, in place of the icons", () => {
    expect(read("mobile/src/intro.tsx")).toContain(
      "<IntroScene card={card.key} game={game} />",
    );
    expect(read("src/components/onboarding/intro-cards.tsx")).toContain(
      "<IntroScene card={card.key} game={game} />",
    );
  });

  it("are drawn from the app's own pieces", () => {
    const app = read("mobile/src/intro-scenes.tsx");
    expect(app).toContain("<FlareStatus />");
    expect(app).toContain('<StateBand state="found" />');
    expect(read("src/components/onboarding/intro-scenes.tsx")).toContain(
      "<FlareStatus />",
    );
  });

  it("wear the picked game's art, bundled on both platforms", () => {
    const table = read("mobile/src/intro-art.ts");
    for (const game of Object.keys(INTRO_ART)) {
      for (const n of [1, 2, 3]) {
        expect(
          existsSync(resolve(ROOT, `mobile/assets/intro/${game}-${n}.jpg`)),
          game,
        ).toBe(true);
        expect(existsSync(resolve(ROOT, `public/intro/${game}-${n}.jpg`)), game).toBe(
          true,
        );
        expect(table).toContain(`../assets/intro/${game}-${n}.jpg`);
      }
    }
    expect(introGame(["riftbound", "pokemon"])).toBe("pokemon");
    expect(introGame(["riftbound"])).toBe("one-piece");
    expect(introGame([])).toBe("one-piece");
  });
});
