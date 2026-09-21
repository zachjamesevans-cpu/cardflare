import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The loading state is a ring, not a word.
 *
 * The founder: "the 'loading' screen everywhere needs to be updated.
 * Maybe just a rotating green thing... not pretty to go into a room
 * and there's just this tiny 'loading' text in top left." So there is
 * one Spinner, in tokens, and every tab-bar route has a loading.tsx
 * that draws it inside the page's own chrome. Pinned so a route cannot
 * quietly lose its loading state, and so the word cannot come back on
 * its own.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("the spinner", () => {
  const spinner = read("src/components/ui/spinner.tsx");

  it("is a rotating accent ring drawn from tokens", () => {
    expect(spinner).toContain("export function Spinner(");
    expect(spinner).toContain("export function LoadingScreen(");
    expect(spinner).toContain(
      "animate-spin rounded-full border-2 border-border border-t-accent",
    );
    expect(spinner).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    /* A Server Component: no hooks, no directive. */
    expect(spinner).not.toContain('"use client"');
  });

  it("tells a screen reader what the ring is", () => {
    expect(spinner).toContain('role="status"');
    expect(spinner).toContain('<span className="sr-only">Loading</span>');
    expect(spinner).toContain("min-h-[40dvh]");
  });
});

describe("every tab-bar route has a loading state in its own chrome", () => {
  const routes = [
    "src/app/feed/loading.tsx",
    "src/app/room/loading.tsx",
    "src/app/flare/loading.tsx",
    "src/app/inbox/loading.tsx",
    "src/app/hunts/[huntId]/loading.tsx",
    "src/app/p/[playerId]/loading.tsx",
    "src/app/s/[storeId]/loading.tsx",
  ];

  it.each(routes)("%s draws the ring inside its page's own chrome", (path) => {
    const file = read(path);
    expect(file).toContain("export default function Loading()");
    /* Either the shared tab shell or the page's own main with the tab
       bar, so nothing moves when the page lands over the fallback. */
    expect(
      file.includes("<TabPageShell") ||
        (file.includes("<PlayerTabBar />") && file.includes("<TabBarSpacer />")),
    ).toBe(true);
    expect(file).toContain("<LoadingScreen");
    /* Server Components, so the shell's tab bar can read the session. */
    expect(file).not.toContain('"use client"');
    expect(file).not.toMatch(/\buse[A-Z]\w*\(/);
  });

  it("says what it is doing on the room's board alone, same words as the app", () => {
    /* The room suspends inside its page, past the code check, so a
       malformed code stays a 404 while a real one shows the ring. */
    expect(read("src/components/events/room-loading.tsx")).toContain(
      '<LoadingScreen label="Opening the room" />',
    );
    const room = read("src/app/e/[code]/page.tsx");
    expect(room).toContain("<Suspense fallback={<RoomLoading />}>");
    expect(room.indexOf("notFound()")).toBeLessThan(room.indexOf("<Suspense"));
    for (const path of routes) {
      if (path.includes("/e/")) continue;
      expect(read(path)).toContain("<LoadingScreen />");
    }
  });

  it.each(["src/app/profile/loading.tsx", "src/app/store/loading.tsx"])(
    "%s draws the ring in a plain main",
    (path) => {
      const file = read(path);
      expect(file).toContain("export default function Loading()");
      expect(file).toContain("<LoadingScreen");
      expect(file).toContain('<main id="main"');
      expect(file).not.toContain('"use client"');
    },
  );
});

describe("no bare loading text in the room, the feed or the composer", () => {
  it("draws the ring where the word used to sit", () => {
    const social = read("src/components/feed/post-social.tsx");
    expect(social).toContain('<Spinner size="sm" />');
    expect(social).not.toContain("Loading…");
    expect(social).not.toContain("Loader2");

    const local = read("src/components/local/local-screen.tsx");
    expect(local).toContain("<Spinner />");
    expect(local).not.toContain(">Loading…<");

    const composer = read("src/components/flares/flare-composer.tsx");
    expect(composer).toContain('<Spinner size="sm" />');
    expect(composer).toContain("Loading your draft…");
  });
});
