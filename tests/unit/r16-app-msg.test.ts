import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { threadTimeLabel } from "@/components/local/thread-time";
import { chatTimeLine } from "../../mobile/src/chat-time";
import {
  FLARE_OUTCOME_LABELS,
  groupByMonth,
  HISTORY_FILTERS,
  historyItems,
} from "../../mobile/src/history-items";

/**
 * Round 16 in the app: the chat (a ⋯ in the header instead of massive
 * Block and Report buttons, the meet block gone, Instagram's runs, a
 * composer that stops at five lines), the Flare tab's list without the
 * finished Flares, and History with All · Trades · Flares.
 */

const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

const thread = read("mobile/src/screens/thread.tsx");
const hub = read("mobile/src/screens/hub.tsx");
const local = read("mobile/src/screens/local.tsx");
const historyScreen = read("mobile/src/screens/trade-history.tsx");
const historyRows = read("mobile/src/trade-history.tsx");
const api = read("mobile/src/api.ts");
const webFlareRow = read("src/components/trades/flare-history-row.tsx");

describe("the chat header", () => {
  it("is their face, their name and the @handle, opening their profile", () => {
    expect(thread).toContain("headerTitle: () => (");
    expect(thread).toContain("handle={thread.withHandle ?? null}");
    expect(thread).toContain("@{handle}");
    expect(thread).toContain(
      'navigation.navigate("PlayerProfile", { playerId: otherId })',
    );
    expect(api).toContain("withHandle?: string | null;");
  });

  it("has a small ⋯ at the right holding View profile, We traded, Report, Block", () => {
    expect(thread).toContain("headerRight: () => (");
    expect(thread).toMatch(/<HeaderButton\s+icon="ellipsis-horizontal"\s+label="More"/);
    expect(thread).toContain("<ActionSheet");
    const order = ["View profile", "We traded", "Report", "Block"].map((label) =>
      thread.indexOf(`label: "${label}"`),
    );
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("no longer draws Block, Report or We traded as buttons in the body", () => {
    expect(thread).not.toMatch(/<Button\s+label="Block"/);
    expect(thread).not.toMatch(/<Button\s+label="Report"/);
    expect(thread).not.toMatch(/<Button\s+label="We traded"/);
    /* The flows behind them are unchanged. */
    expect(thread).toContain("blockPlayer(withPlayerId)");
    expect(thread).toContain('setReport({ kind: "thread", targetId: threadId })');
    expect(thread).toContain("proposeThreadTrade(");
    expect(thread).toContain('label="Mark as traded"');
  });

  it("dropped the meet suggestion entirely", () => {
    expect(thread).not.toContain("Meet somewhere public");
    expect(thread).not.toContain("suggestText");
    expect(thread).not.toContain("meetLine");
    expect(thread).not.toContain("setMeet");
  });
});

describe("the messages, Instagram's way", () => {
  it("are laid out by messageRuns", () => {
    expect(thread).toContain("const runs = messageRuns(messages ?? []);");
    expect(thread).toContain("flags.showTime ? (");
    expect(thread).toContain("chatTimeLine(item.sentAt)");
    expect(thread).toContain("flags.showFace ? (");
    expect(thread).toContain("marginBottom: flags.joinsNext ? 2 : spacing(3)");
  });

  it("draw their face at 24pt and never your own", () => {
    expect(thread).toMatch(
      /!item\.yours \? \(\s*<View style=\{\{ width: 24, height: 24 \}\}>/,
    );
    expect(thread).toMatch(/size=\{24\}/);
    /* No stamp on every bubble any more. */
    expect(thread).not.toContain("agoLabel(");
  });

  it("stamp the time the website's way", () => {
    const now = new Date(2026, 9, 6, 15, 0);
    for (const at of [
      new Date(2026, 9, 6, 9, 5),
      new Date(2026, 9, 5, 22, 41),
      new Date(2026, 9, 2, 12, 0),
      new Date(2026, 8, 12, 15, 4),
      new Date(2025, 11, 31, 23, 59),
    ]) {
      expect(chatTimeLine(at.toISOString(), now)).toBe(
        threadTimeLabel(at.toISOString(), now),
      );
    }
    expect(chatTimeLine(new Date(2026, 9, 5, 22, 41).toISOString(), now)).toMatch(
      /^Yesterday /,
    );
    expect(chatTimeLine("not a date", now)).toBe("");
  });
});

describe("the composer", () => {
  it("grows to COMPOSER_MAX_LINES and then scrolls inside", () => {
    expect(thread).toContain(
      "const composerMax = COMPOSER_MAX_LINES * composerLine + spacing(3) * 2 + 2;",
    );
    expect(thread).toContain("maxHeight: composerMax");
    expect(thread).toContain("scrollEnabled");
    expect(thread).toContain("multiline");
  });

  it("sends tidyMessage and refuses an empty result", () => {
    expect(thread).toContain("const body = tidyMessage(draft);");
    expect(thread).toMatch(/const body = tidyMessage\(draft\);\s+if \(!body\) return;/);
    expect(thread).not.toContain("draft.trim()");
  });
});

describe("the conversations list", () => {
  it("previews a multi-line message on one line", () => {
    expect(local).toContain('.replace(/\\s+/g, " ").trim()');
  });
});

describe("the Flare tab's list", () => {
  it("shows only the Flares still working", () => {
    expect(hub).toContain("wants?.filter((want) => !want.found)");
    expect(hub).toContain("working.map((want) => (");
    expect(hub).not.toContain("wants.map((want) => (");
  });

  it("points at History where the finished ones went", () => {
    expect(hub).toContain('navigation.navigate("TradeHistory")');
    expect(hub).toContain('name="time-outline"');
    expect(hub).toMatch(/>\s*History\s*</);
  });
});

const trade = (id: string, at: string) => ({
  id,
  cardId: "c",
  cardName: "Luffy",
  cardNumber: "OP01-001",
  imageUrl: null,
  quantity: 1,
  got: true,
  partnerName: null,
  storeName: null,
  eventName: null,
  confirmedAt: at,
  status: "confirmed",
  embers: 0,
});

const flare = (flareId: string, endedAt: string) => ({
  flareId,
  direction: "want",
  cardId: "c",
  cardName: "Zoro",
  cardNumber: "OP01-025",
  imageUrl: null,
  quantity: 2,
  outcome: "found",
  postedAt: "2026-09-01T12:00:00.000Z",
  endedAt,
  responders: [],
});

describe("History", () => {
  it("has the chips All · Trades · Flares, in that order", () => {
    expect(HISTORY_FILTERS.map((chip) => chip.label)).toEqual([
      "All",
      "Trades",
      "Flares",
    ]);
    expect(historyScreen).toContain("HISTORY_FILTERS.map(");
    expect(historyScreen).toContain("<Title>History</Title>");
    expect(historyScreen).not.toContain("Trade history");
  });

  it("merges trades and Flares by date under All, and filters the rest", () => {
    const trades = [trade("t1", "2026-10-03T12:00:00.000Z")];
    const flares = [
      flare("f1", "2026-10-05T12:00:00.000Z"),
      flare("f2", "2026-09-20T12:00:00.000Z"),
    ];
    expect(historyItems("all", trades, flares).map((item) => item.kind)).toEqual([
      "flare",
      "trade",
      "flare",
    ]);
    expect(historyItems("trades", trades, flares).map((item) => item.kind)).toEqual([
      "trade",
    ]);
    expect(historyItems("flares", trades, flares).map((item) => item.kind)).toEqual([
      "flare",
      "flare",
    ]);
    const months = groupByMonth(historyItems("all", trades, flares), (iso) =>
      iso.slice(0, 7),
    );
    expect(months.map((month) => [month.label, month.items.length])).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
    ]);
  });

  it("keeps the Pro gate on trade rows exactly as it was, and Flares free", () => {
    expect(historyScreen).toContain(
      "historyItems(filter, history.locked ? [] : history.trades, flares)",
    );
    expect(historyScreen).toContain("showTrades && history.locked ? (");
    expect(historyScreen).toContain("<LockedRows count={6} />");
    expect(historyScreen).toContain("<TradeHistoryWall");
    /* Logging stays Pro, as before. */
    expect(historyScreen).toMatch(
      /!history\.locked \? \(\s*<Button\s+label="Log a trade"/,
    );
  });

  it("reads past Flares from the app's endpoint", () => {
    expect(api).toContain('"/api/v1/flares/history"');
    expect(api).toContain("export const getFlareHistory");
    expect(historyScreen).toContain("getFlareHistory()");
  });

  it("draws a past Flare the website's way", () => {
    for (const label of ["Found", "Traded", "Taken down"]) {
      expect(Object.values(FLARE_OUTCOME_LABELS)).toContain(label);
      expect(webFlareRow).toContain(`"${label}"`);
    }
    expect(historyRows).toContain("export function FlareHistoryRow(");
    expect(historyRows).toContain("`Posted ${dayOf(flare.postedAt)}`");
    expect(historyRows).toContain("`Ended ${dayOf(flare.endedAt)}`");
    expect(historyRows).toContain("<QuantityBadge quantity={responder.quantity} />");
    expect(historyRows).toContain("onOpenThread(threadId)");
    expect(historyScreen).toContain('navigation.navigate("LocalThread", { threadId })');
  });
});
