import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Properties of the television that are judged by eye — held here so
 * they cannot regress silently.
 *
 * This project's test runner is Node with no DOM (see vitest.config.ts),
 * so these are read off the source the way
 * `tests/unit/rive-cosmetics.test.ts` reads its own. That is a genuine
 * limitation and worth naming: what follows proves the rule is still
 * WRITTEN, not that a browser painted it. The visual pass is a render,
 * not a test.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");

const panel = read("src/components/event-hub/timer-panel.tsx");
const screen = read("src/components/event-hub/display-screen.tsx");
const board = read("src/components/event-hub/flare-board.tsx");
const featured = read("src/components/event-hub/featured-flare.tsx");
const page = read("src/app/display/[token]/page.tsx");
const css = read("src/app/globals.css");

describe("the overtime card stays over its own tournament", () => {
  it("is positioned inside the panel, never over the page", () => {
    /* The rule that makes two tournaments work: One Piece reaching zero
       must not put a rules card over the Flesh and Blood timer, which
       has twenty minutes left. */
    expect(panel).toContain("absolute inset-0");
    expect(panel).not.toContain("fixed inset-0");
  });

  it("is rendered by the panel, not by the screen", () => {
    expect(panel).toContain("<OvertimeOverlay");
    expect(screen).not.toContain("OvertimeOverlay");
  });

  it("carries the disclaimer every time it appears", () => {
    expect(panel).toContain("RULES_DISCLAIMER");
  });

  it("reads its steps from the profile rather than holding any itself", () => {
    /* The whole reason the profiles exist: a publisher changing a
       procedure is an edit to data, not to this component. */
    expect(panel).toContain("procedure.steps.map");
    expect(panel).not.toMatch(/Finish the current turn/);
    expect(panel).not.toMatch(/additional turns\./);
  });
});

describe("motion", () => {
  it("gates every animation behind motion-safe", () => {
    const animations =
      [...screen.matchAll(/animate-\[/g)].length +
      [...panel.matchAll(/animate-\[/g)].length +
      [...board.matchAll(/animate-\[/g)].length;

    const guarded =
      [...screen.matchAll(/motion-safe:animate-\[/g)].length +
      [...panel.matchAll(/motion-safe:animate-\[/g)].length +
      [...board.matchAll(/motion-safe:animate-\[/g)].length;

    expect(animations).toBeGreaterThan(0);
    expect(guarded).toBe(animations);
  });

  it("defines both keyframes and loops neither", () => {
    for (const name of ["cf-overtime-in", "cf-flare-in"]) {
      expect(css).toContain(`@keyframes ${name}`);
      /* A screen in the corner of people's eyes for eight hours is a
         screen staff unplug if anything on it loops. */
      expect(panel + screen + board).not.toContain(`${name} infinite`);
    }
  });

  it("never flashes the whole screen", () => {
    expect(screen).not.toMatch(/animate-pulse|animate-ping|animate-bounce/);
    expect(panel).not.toMatch(/animate-pulse|animate-ping|animate-bounce/);
  });
});

describe("readable from across a shop", () => {
  it("sizes the clock fluidly rather than at one fixed size", () => {
    /* A 1366x768 projector and a 1080p television are different rooms.
       clamp() lets one layout serve both without stretching. */
    expect(panel).toContain("clamp(");
    expect(panel).toMatch(/CLOCK_SIZE/);
  });

  it("gives the digits a monospaced, tabular face", () => {
    /* Proportional digits jitter as the seconds change, which reads as a
       wobble from thirty feet away. */
    expect(panel).toContain("font-mono");
    expect(panel).toContain("tabular-nums");
  });

  it("makes the game the panel's headline, above everything but the clock", () => {
    /*
     * The founder, looking at a wall from across a shop: "the game name
     * should be much bigger font, should take up pretty much the entire
     * top of the tournament widget."
     *
     * The order that has to hold: the clock is the biggest thing, the
     * game is next, and the tournament's own name is small print under
     * it. Read as the maximum of each clamp, per layout, so a future
     * tweak that quietly demotes the game fails here.
     */
    const cap = (scale: string, layout: string) => {
      const block = panel.slice(panel.indexOf(`const ${scale}`));
      const line = block.slice(block.indexOf(`${layout}:`)).split("\n")[0];
      /* Either shape: a clamp() class, or the {min, max} bounds the
         game's name is built from. */
      const max = /,([0-9.]+)rem\)/.exec(line) ?? /max: "([0-9.]+)rem"/.exec(line);
      if (!max) throw new Error(`No ${layout} size in ${scale}`);
      return Number(max[1]);
    };

    for (const layout of ["single", "split", "grid"]) {
      expect(cap("CLOCK_SIZE", layout)).toBeGreaterThan(cap("GAME_SIZE", layout));
      expect(cap("GAME_SIZE", layout)).toBeGreaterThan(cap("ROUND_SIZE", layout));
      expect(cap("ROUND_SIZE", layout)).toBeGreaterThanOrEqual(
        cap("META_SIZE", layout),
      );
    }
  });

  it("sizes the game's name from its panel, so it never truncates", () => {
    /*
     * The founder's photograph of a 1080p wall: "ONE PIE..." with a
     * third of the panel empty beside it. The name took a share of the
     * VIEWPORT, which assumed a panel the width of the wall. Now it
     * takes a share of the panel — container width divided by how many
     * letters must fit — and the panel declares itself the container.
     */
    expect(panel).toContain("cqw");
    expect(panel).toMatch(/gameNameSize\(layout, profile\.shortName\)/);
    expect(panel).not.toMatch(/\$\{GAME_SIZE\[layout\]\}/);
    expect([...panel.matchAll(/@container/g)].length).toBeGreaterThanOrEqual(2);
    /* The estimate has to be pessimistic: a wide capital is 0.7em. */
    expect(panel).toMatch(/const CAP_ADVANCE = 0\.7;/);
  });

  it("lays the overview cards out to the space, not to a column count", () => {
    /*
     * Three Flares in a tall column used to be three thumbnails across
     * the middle of the panel with the rest empty. The panel is measured
     * and each card is as large as both the width and the height allow.
     */
    expect(featured).toContain("ResizeObserver");
    expect(featured).toContain("Math.min(byWidth, byHeight)");
    expect(featured).toContain("Math.min(shown.length, 2)");
    expect(featured).not.toContain("gridTemplateColumns");
  });

  it("uses the short name, which is the one that reads at forty feet", () => {
    /* "One Piece" reads across a shop; "One Piece Card Game" wraps. */
    expect(panel).toContain("{profile.shortName}");
  });

  it("keeps the game legible on the rules card too", () => {
    /* The one moment a room most needs to know WHICH tournament is the
       moment the rules card covers the panel's headline. */
    expect(panel).toContain("OVERLAY_GAME_SIZE");
  });

  it("says every urgency band in words as well as colour", () => {
    expect(panel).toContain("URGENCY_WORD");
    expect(panel).toContain("Under 10 minutes");
    expect(panel).toContain("Under 5 minutes");
    expect(panel).toContain("Final minute");
  });

  it("gives the clock a spoken equivalent and a timer role", () => {
    expect(panel).toContain('role="timer"');
    expect(panel).toContain("speakClock");
  });
});

describe("the QR code", () => {
  it("sits on a light plate, because a dark QR does not scan", () => {
    expect(screen).toContain("bg-white");
  });

  it("says JOIN, with the short code under the square", () => {
    /* The founder: "The scan to join text can just be changed to
       'JOIN'... Then the room code can just be fit under the QR code."
       One word for every QR on the site; the counter sheet says the
       same. */
    expect(screen).not.toContain("Scan to join");
    expect(screen).toMatch(/>\s*Join\s*</);
    expect(screen).toContain("{code}");
    expect(read("src/components/events/join-poster.tsx")).toMatch(/>\s*Join\s*</);
    expect(read("src/lib/events/poster-pdf.ts")).toContain('"JOIN"');
  });

  it("is encoded once on the server rather than in the browser", () => {
    /* The store's counter code does not change while a television is
       switched on. */
    expect(page).toContain("joinQrSvg");
    expect(screen).not.toContain("joinQrSvg");
  });

  it("scales with the viewport rather than being fixed enormous", () => {
    /* The square's size is one variable, in viewport height, and the
       plate, the column and both lines are sized from it. */
    expect(screen).toMatch(/"--qr" as string\]: "clamp\([^)]*vh/);
    expect(screen).toContain("size-[var(--qr)]");
  });
});

describe("the empty board", () => {
  it("says what to do rather than nothing", () => {
    expect(board).toContain("Nothing on the board yet");
    expect(board).toContain("Scan to post a card you");
  });
});

describe("the display is not an application", () => {
  it("has no AppShell, no navigation and no sign-in", () => {
    /* Checked as imports rather than as strings: the page's own comment
       says the words, which is the point of it. */
    expect(page).not.toContain('from "@/components/layout/app-shell"');
    expect(page).not.toContain('from "@/components/players/player-tab-bar"');
    expect(page).not.toContain('from "@/lib/auth/session"');
  });

  it("is never indexed", () => {
    expect(page).toContain("index: false");
  });

  it("offers fullscreen and asks for a wake lock", () => {
    expect(screen).toContain("requestFullscreen");
    expect(screen).toContain("wakeLock");
  });

  it("survives both being refused", () => {
    /* Kiosk shells refuse fullscreen; several TV sticks have no Wake
       Lock API at all. Neither failing may cost the display anything. */
    expect(screen).toContain('if (!("wakeLock" in navigator)) return;');
    expect(screen.match(/catch\s*\{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("keeps the only control out of the way until a mouse moves", () => {
    expect(screen).toContain("mousemove");
    expect(screen).toContain("opacity-0");
    /* Still reachable by keyboard, which is the whole reason it is a
       button rather than something that appears on hover. */
    expect(screen).toContain("focus-visible:opacity-100");
  });
});

describe("running for eight hours", () => {
  it("clears every interval it sets", () => {
    const clock = read("src/components/event-hub/display-clock.ts");

    for (const source of [screen, clock]) {
      const set = (source.match(/setInterval\(/g) ?? []).length;
      const cleared = (source.match(/clearInterval\(/g) ?? []).length;
      expect(cleared).toBeGreaterThanOrEqual(set);
    }
  });

  it("stops the audio nodes it starts", () => {
    expect(screen).toContain("oscillator.stop(");
    expect(screen).toContain("context.current?.close()");
  });

  it("polls rather than holding a socket open", () => {
    /* Deliberate — see ARCHITECTURE.md. No countdown crosses the wire,
       so the interval only decides how fast a pause reaches the wall. */
    expect(read("src/components/event-hub/display-clock.ts")).not.toContain(
      "WebSocket",
    );
    expect(screen).not.toContain("EventSource");
  });

  it("skips polling while the television is on another input", () => {
    expect(read("src/components/event-hub/display-clock.ts")).toContain(
      'document.visibilityState !== "visible"',
    );
  });
});
