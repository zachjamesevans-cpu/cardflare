import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { threadTimeLabel } from "../../src/components/local/thread-time";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Round 16 on the website: the chat drawn Instagram's way, the Flare
 * tab's list holding only the Flares still working, and History with
 * its three chips. The app's half is tests/unit/r16-app-msg.test.ts.
 *
 * Read off the source where the point is what is drawn and in which
 * words; the time line's rule is run for real.
 */

const local = read("src/components/local/local-screen.tsx");
const composer = read("src/components/local/message-composer.tsx");
const flarePage = read("src/app/flare/page.tsx");
const historyPage = read("src/app/profile/trades/page.tsx");
const history = read("src/components/trades/history.tsx");
const flareRow = read("src/components/trades/flare-history-row.tsx");

/** One top-level function's source, from its declaration to the next. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const view = fn(local, "ThreadView");

describe("the chat header: chevron, face, name over @handle, and a ⋯", () => {
  it("is a plain chevron, no words, named Back", () => {
    const back = view.slice(view.indexOf("onClick={onBack}"));
    expect(back.slice(0, 400)).toContain('aria-label="Back"');
    expect(back.slice(0, 400)).toContain("<ChevronLeft");
    expect(view).not.toContain('LOCAL_ENABLED ? "Local" : "Messages"');
  });

  it("opens their profile from the face and the name, with the handle under it", () => {
    expect(view).toContain("setWithHandle(thread.withHandle ?? null)");
    const link = view.slice(view.indexOf("href={`/p/${withPlayerId}`}"));
    const end = link.indexOf("</Link>");
    expect(link.indexOf("<PlayerAvatar")).toBeLessThan(end);
    expect(link.indexOf("{name}")).toBeLessThan(end);
    expect(link.indexOf("@{withHandle}")).toBeLessThan(end);
  });

  it("keeps View profile, We traded, Report and Block behind the ⋯, in that order", () => {
    expect(view).toContain("<DotsMenu items={menu}");
    const labels = [...view.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toEqual(["View profile", "We traded", "Report", "Block"]);
    expect(view).toContain("router.push(`/p/${withPlayerId}`)");
    expect(view).toContain("setComposingTrade(true)");
    expect(view).toContain("onSelect: () => setReporting(true)");
    expect(view).toContain("onSelect: () => setAsking(true)");
  });

  it("no longer draws Block, Report or We traded as buttons in the body", () => {
    expect(view).not.toContain("<TradeTrigger");
    expect(local).not.toContain("TradeTrigger");
    expect(view).not.toMatch(/>\s*Report\s*</);
    /* Block's confirm is still asked, only from the menu now. */
    expect(view).toContain('Block {withName ?? "them"}?');
  });

  it("draws the meet suggestion nowhere", () => {
    expect(local).not.toContain("Meet somewhere public");
    expect(local).not.toContain("suggestText");
    expect(local).not.toContain("setMeet");
  });
});

describe("the messages, run together", () => {
  it("lays the conversation out with messageRuns", () => {
    expect(view).toContain("messageRuns(messages)");
    expect(view).toContain("run?.showTime &&");
    expect(view).toContain("run?.showFace ?");
    expect(view).toContain('run?.joinsNext ? "pb-0.5" : "pb-3 last:pb-0"');
  });

  it("puts their face beside their messages only, at 24 pixels", () => {
    const face = view.slice(view.indexOf("{!message.yours &&"));
    expect(face.slice(0, 600)).toContain("size-6!");
    expect(face.slice(0, 600)).toContain('<span className="size-6 shrink-0"');
  });

  it("stamps the time on a pause, not on every bubble", () => {
    expect(view).toContain("threadTimeLabel(message.sentAt)");
    expect(view).not.toContain("agoLabel(message.sentAt)");
  });
});

describe("the time line", () => {
  const now = new Date("2026-10-06T18:00:00Z");
  const label = (iso: string) => threadTimeLabel(iso, now, "UTC");

  it("is the clock today, and names the day otherwise", () => {
    expect(label("2026-10-06T15:04:00Z")).toBe("3:04 PM");
    expect(label("2026-10-05T15:04:00Z")).toBe("Yesterday 3:04 PM");
    expect(label("2026-10-02T15:04:00Z")).toBe("Fri 3:04 PM");
    expect(label("2026-09-12T15:04:00Z")).toBe("Sep 12, 3:04 PM");
  });

  it("says nothing for a date it cannot read", () => {
    expect(label("not a date")).toBe("");
  });
});

describe("the message box", () => {
  it("grows to COMPOSER_MAX_LINES lines, then scrolls inside", () => {
    expect(composer).toContain("COMPOSER_MAX_LINES");
    expect(composer).toContain("line * COMPOSER_MAX_LINES + padding + border");
    expect(composer).toContain(
      'field.style.overflowY = wanted > cap ? "auto" : "hidden"',
    );
    expect(composer).toContain("rows={1}");
  });

  it("sends on Enter and keeps Shift+Enter for a new line", () => {
    expect(composer).toContain(
      'if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)',
    );
    expect(composer).toContain("event.preventDefault();");
  });

  it("sends the tidied message, and nothing when nothing is left", () => {
    const send = view.slice(view.indexOf("function send()"));
    expect(send).toContain("const body = tidyMessage(draft);");
    expect(send).toContain("if (!body) return;");
    expect(view).toContain("<MessageComposer");
  });
});

describe("the Flare tab's list: only the Flares still working", () => {
  it("leaves out a card whose every copy is found", () => {
    expect(flarePage).toContain("foundCardsFor(playerId)");
    expect(flarePage).toContain(
      '(want) => want.direction === "offering" || !foundCards.has(want.cardId)',
    );
    /* Gone, not greyed. */
    expect(flarePage).not.toContain("found: foundCards");
  });

  it("points at History, where the finished ones went", () => {
    expect(flarePage).toContain('href="/profile/trades"');
    expect(flarePage).toMatch(
      /<History className="size-4" aria-hidden="true" \/>\s+History/,
    );
  });
});

describe("History", () => {
  it("is called History, at the same address", () => {
    expect(historyPage).toContain('title: "History"');
    expect(historyPage).toContain('title="History"');
    expect(historyPage).not.toContain("Trade history");
    expect(history).not.toContain("Trade history");
    expect(historyPage).toContain('redirect("/login?next=/profile/trades")');
  });

  it("reads the past Flares beside the trades", () => {
    expect(historyPage).toContain("listFlareHistory(playerId)");
    expect(historyPage).toContain("<HistoryList");
    expect(historyPage).toContain("flares={flares}");
  });

  it("has a plain chevron back to the profile", () => {
    expect(historyPage).toContain('<BackLink href="/profile" />');
    expect(historyPage).not.toContain("Back to your profile");
  });

  it("filters with All · Trades · Flares, in that order", () => {
    const list = fn(history, "HistoryList");
    const labels = [...history.matchAll(/\{ key: "(\w+)", label: "([^"]+)" \}/g)].map(
      (match) => match[2],
    );
    expect(labels).toEqual(["All", "Trades", "Flares"]);
    expect(list).toContain('aria-label="What to show"');
    /* All merges both by date: a trade by when it was confirmed, a
       Flare by when it ended. */
    expect(list).toContain("at: trade.confirmedAt");
    expect(list).toContain("at: flare.endedAt");
    expect(list).toContain(".sort((a, b) => b.at.localeCompare(a.at))");
  });

  it("keeps the Pro gate on trade rows exactly as it was", () => {
    const list = fn(history, "HistoryList");
    expect(list).toContain("showTrades && !locked");
    expect(list).toContain("<LockedRows count={6} />");
    expect(list).toContain("<TradeHistoryWall count={totals.trades} />");
    /* The page still offers logging only to those who can read rows. */
    expect(historyPage).toContain("{!history.locked && (");
  });

  it("draws a past Flare with its art, count, outcome, dates and who answered", () => {
    const row = fn(flareRow, "FlareHistoryRow");
    expect(row).toContain("flare.imageUrl");
    expect(row).toContain("<QuantityBadge");
    expect(row).toContain("FLARE_OUTCOME_LABELS[flare.outcome]");
    expect(flareRow).toContain('found: "Found"');
    expect(flareRow).toContain('traded: "Traded"');
    expect(flareRow).toContain('"taken-down": "Taken down"');
    expect(row).toContain('Posted <LocalDate iso={flare.postedAt} format="day" />');
    expect(row).toContain('Ended <LocalDate iso={flare.endedAt} format="day" />');
    expect(row).toContain("flare.responders.map(");
    expect(row).toContain("avatarUrl={responder.avatarUrl}");
    expect(row).toContain("{responder.name}");
    expect(row).toContain("<LocalMoment iso={responder.at} />");
    expect(row).toContain("<QuantityBadge quantity={responder.quantity}");
  });

  it("opens your chat with whoever answered, when there is one", () => {
    const row = fn(flareRow, "FlareHistoryRow");
    expect(row).toContain("responder.threadId ? (");
    expect(row).toContain(
      "href={`/local?thread=${encodeURIComponent(responder.threadId)}`}",
    );
  });
});
