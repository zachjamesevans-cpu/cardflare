import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/**
 * Round 8, both platforms: "We traded" inside a conversation, the
 * history row that says where a conversation trade was confirmed, and
 * the admin's per-player activity page.
 *
 * Read off the source, because parity is about the same states, the
 * same wording and the same order on the website and in the app. The
 * strings here are the ones the brief fixed; a platform that says it
 * differently fails here before it ships.
 */

const web = {
  tradeBlock: read("src/components/local/thread-trade-block.tsx"),
  thread: read("src/components/local/local-screen.tsx"),
  history: read("src/components/trades/history.tsx"),
  adminPage: read("src/app/admin/players/[id]/page.tsx"),
  activity: read("src/components/admin/player-activity.tsx"),
  adminRow: read("src/components/admin/admin-player-row.tsx"),
};

const app = {
  thread: read("mobile/src/screens/thread.tsx"),
  history: read("mobile/src/trade-history.tsx"),
  api: read("mobile/src/api.ts"),
};

describe("We traded, in a conversation", () => {
  const CONFIRM_LINE = "They confirm on their side and you both earn Embers.";

  it("offers the same four words on both platforms", () => {
    for (const source of [web.tradeBlock, app.thread]) {
      expect(source).toContain("We traded");
      expect(source).toContain("Mark as traded");
      expect(source).toContain("Marking…");
      expect(source).toContain("Yes, we did");
      expect(source).toContain("Confirming…");
      expect(source).toContain(CONFIRM_LINE);
      expect(source).toContain("Yes pays you both Embers.");
    }
  });

  it("says the three states in the same sentences", () => {
    for (const source of [web.tradeBlock, app.thread]) {
      expect(source).toContain("You said you traded");
      expect(source).toContain("to confirm. Then you both earn Embers.");
      expect(source).toContain("says you traded");
      expect(source).toContain("Both confirmed.");
      expect(source).toContain("never confirmed.");
      expect(source).toContain("said that trade did not happen.");
      expect(source).toContain("You said that trade did not happen.");
    }
  });

  it("draws the direct-message form with a picker, I got it / I gave it, and Copies", () => {
    expect(web.tradeBlock).toContain("<CardSearch");
    expect(web.tradeBlock).toContain('"I got it"');
    expect(web.tradeBlock).toContain('"I gave it"');
    expect(web.tradeBlock).toContain("<Stepper");
    expect(web.tradeBlock).toContain("max={THREAD_TRADE_QUANTITY_MAX}");
    expect(web.tradeBlock).toContain(">Copies</p>");
    expect(web.tradeBlock).toMatch(/\n\s+Cancel\n/);

    expect(app.thread).toContain("I got it");
    expect(app.thread).toContain("I gave it");
    expect(app.thread).toContain("Copies");
  });

  it("is prop-driven on the web, with the thread screen owning the calls", () => {
    expect(web.tradeBlock).toContain("export function ThreadTradeBlock(");
    expect(web.tradeBlock).toContain("onPropose: (input: ProposeInput) => void;");
    expect(web.tradeBlock).toContain(
      "onAnswer: (tradeId: string, yes: boolean) => void;",
    );
    expect(web.tradeBlock).toContain("<Handshake");

    expect(web.thread).toContain("<ThreadTradeBlock");
    expect(web.thread).toContain("proposeTradeAction(threadId, input)");
    expect(web.thread).toContain("answerTradeAction(tradeId, yes)");
    /* The trigger leads the row with Block and Report. */
    expect(web.thread.indexOf("<TradeTrigger")).toBeLessThan(
      web.thread.indexOf("onClick={() => setAsking(true)}"),
    );
    /* And the block sits above the composer, hidden once blocked. */
    expect(web.thread.indexOf("<ThreadTradeBlock")).toBeGreaterThan(
      web.thread.indexOf("{blocked ? ("),
    );
    expect(web.thread.indexOf("<ThreadTradeBlock")).toBeLessThan(
      web.thread.indexOf('aria-label="Message"'),
    );
  });

  it("reaches the same API from the app", () => {
    expect(app.api).toContain("ThreadTrade");
    expect(app.api).toMatch(/\/trade`/);
    expect(app.api).toContain('answer: "yes"');
  });
});

describe("a conversation trade in the history", () => {
  it("says In a conversation where a room trade names its store, on both", () => {
    expect(web.history).toContain("In a conversation");
    expect(web.history).toContain('trade.source === "conversation"');
    expect(app.history).toContain("In a conversation");
    expect(app.api).toMatch(/"room" \| "conversation" \| "logged"/);
  });
});

describe("the admin's player activity page", () => {
  it("reads the timeline, refuses a stranger, and hands the body to PlayerActivity", () => {
    expect(web.adminPage).toContain("playerTimeline(");
    expect(web.adminPage).toContain("requireAdmin()");
    expect(web.adminPage).toContain("notFound()");
    expect(web.adminPage).toContain('export const dynamic = "force-dynamic"');
    expect(web.adminPage).toContain("<PlayerActivity timeline={timeline} />");
    expect(web.adminPage).toContain('href="/admin/players"');
  });

  it("draws facts, counts and the list from the timeline alone", () => {
    expect(web.activity).not.toContain('"use client"');
    expect(web.activity).toContain("export function PlayerActivity(");
    expect(web.activity).toContain("Open profile");
    expect(web.activity).toContain("Nothing yet.");
    expect(web.activity).toContain("Last in a room");
    expect(web.activity).toContain("Embers to spend");
    for (const icon of [
      "room: DoorOpen",
      "flare: Flame",
      "post: Image",
      "hunt: Target",
      "trade: Handshake",
      "message: MessageCircle",
      '"report-filed": Flag',
      '"report-received": ShieldAlert',
      "block: Ban",
      "embers: Sparkles",
    ]) {
      expect(web.activity).toContain(icon);
    }
  });

  it("is one tap from the player row", () => {
    expect(web.adminRow).toContain("href={`/admin/players/${playerId}`}");
    expect(web.adminRow).toContain('aria-label="Activity"');
    expect(web.adminRow).toContain("<History");
  });
});
