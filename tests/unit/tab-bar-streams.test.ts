import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The tab bar does not hold a page back while unread messages are
 * counted.
 *
 * `PlayerTabBar` used to await the count before it drew anything, and
 * it is on every tab, so every tab finished two database round trips
 * later than its own data needed. Now the bar is drawn at once and the
 * same bar with the count streams in behind it. Who gets a bar at all
 * has not changed, and neither has what the count is.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const bar = read("src/components/players/player-tab-bar.tsx");
const counted = read("src/components/players/counted-tabs.tsx");

describe("who gets the bar", () => {
  it("is decided before anything is drawn, by the same rule as ever", () => {
    const decided = bar.indexOf("if (!playerId && !guest) return null;");
    expect(decided).toBeGreaterThan(-1);
    expect(bar.indexOf("const viewer = await getViewer();")).toBeLessThan(decided);
    expect(bar.indexOf("await getPlayerSession()")).toBeLessThan(decided);
    expect(decided).toBeLessThan(bar.indexOf("<Suspense"));
  });

  it("gives a guest in a room the bar with no count to wait for", () => {
    expect(bar).toContain("<PlayerTabs unread={0} />");
  });

  it("keeps the take-down toast's host beside the bar", () => {
    expect(bar).toContain("<UndoToastHost />");
  });
});

describe("the count arrives on its own", () => {
  it("streams behind a boundary whose fallback is the bar itself", () => {
    expect(bar).toContain("<Suspense fallback={<TabsWhileCounting />}>");
    expect(bar).toContain("<CountedTabs playerId={playerId} />");
    expect(bar).toContain(
      "return <TabsWithCount unread={await unreadMessages(playerId)} />;",
    );
  });

  it("is awaited nowhere in the bar's own body", () => {
    const body = bar.slice(
      bar.indexOf("export async function PlayerTabBar()"),
      bar.indexOf("async function CountedTabs("),
    );
    expect(body).not.toContain("unreadMessages(");
  });

  it("is the same count as before: the unread messages", () => {
    expect(bar).toContain('import { unreadMessages } from "@/lib/local/threads";');
    expect(bar).not.toContain("unreadCount(");
  });
});

describe("the bar while it waits (counted-tabs.tsx)", () => {
  it("draws the same bar both times", () => {
    expect(counted).toContain("return <PlayerTabs unread={lastUnread} />;");
    expect(counted).toContain("return <PlayerTabs unread={unread} />;");
  });

  it("starts from zero and only remembers a count in the browser", () => {
    expect(counted).toContain("let lastUnread = 0;");
    /* Written in an effect, which never runs on the server, so one
       player's count cannot be drawn for another. */
    expect(counted).toMatch(
      /useEffect\(\(\) => \{\s*lastUnread = unread;\s*\}, \[unread\]\);/,
    );
    expect(counted.match(/lastUnread = /g)).toHaveLength(2);
  });

  it("is a client island and nothing more", () => {
    expect(counted.startsWith('"use client";')).toBe(true);
    expect(counted).not.toContain("fetch(");
    expect(counted).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
