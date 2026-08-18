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

  it("shows the short code underneath it", () => {
    expect(screen).toContain("Scan to join");
    expect(screen).toContain("{code}");
  });

  it("is encoded once on the server rather than in the browser", () => {
    /* The store's counter code does not change while a television is
       switched on. */
    expect(page).toContain("joinQrSvg");
    expect(screen).not.toContain("joinQrSvg");
  });

  it("scales with the viewport rather than being fixed enormous", () => {
    expect(screen).toMatch(/size-\[clamp\([^)]*vh/);
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
