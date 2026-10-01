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
 * Round 4, both platforms: direct messages, "Message" on a wanted row
 * and a profile, logged trades, and hunts answerable in full.
 *
 * Read off the source, because parity is about the same sections, the
 * same wording and the same order on the website and in the app. The
 * strings here are the ones the founder's brief fixed; a platform that
 * says it differently fails here before it ships.
 */

const web = {
  profile: read("src/app/p/[playerId]/page.tsx"),
  messageButton: read("src/components/players/message-button.tsx"),
  feedItems: read("src/components/feed/feed-items.tsx"),
  wantedButton: read("src/components/feed/wanted-message-button.tsx"),
  local: read("src/components/local/local-screen.tsx"),
  huntDetail: read("src/components/players/hunt-detail.tsx"),
  historyPage: read("src/app/profile/trades/page.tsx"),
  history: read("src/components/trades/history.tsx"),
  logTrade: read("src/components/trades/log-trade-sheet.tsx"),
};

const app = {
  profile: read("mobile/src/screens/player-profile.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  local: read("mobile/src/screens/local.tsx"),
  thread: read("mobile/src/screens/thread.tsx"),
  hunts: read("mobile/src/hunts-panel.tsx"),
  historyScreen: read("mobile/src/screens/trade-history.tsx"),
  history: read("mobile/src/trade-history.tsx"),
  logTrade: read("mobile/src/screens/log-trade.tsx"),
  api: read("mobile/src/api.ts"),
  root: read("mobile/App.tsx"),
};

describe("a profile has Message beside Follow", () => {
  it("on the website, under the same condition as Follow, sharing the row", () => {
    expect(web.profile).toContain(
      'import { MessageButton } from "@/components/players/message-button"',
    );
    expect(web.profile).toContain(
      '<MessageButton playerId={playerId} className="flex-1" />',
    );
    expect(web.messageButton).toContain("openDirectThreadAction(playerId)");
    expect(web.messageButton).toContain(
      "router.push(`/local?thread=${encodeURIComponent(result.threadId)}`)",
    );
    expect(web.messageButton).toMatch(/\n\s+Message\n/);
  });

  it("in the app, with the same label and the same door", () => {
    expect(app.profile).toContain('label="Message"');
    expect(app.profile).toContain('icon="chatbubble-outline"');
    expect(app.profile).toContain("openDirectThread(");
    expect(app.profile).toContain('navigation.navigate("LocalThread", { threadId');
  });
});

describe("Wanted from you ends in Message, not Go", () => {
  it("on the website", () => {
    expect(web.feedItems).toContain("<WantedMessageButton");
    expect(web.feedItems).toContain("They already asked. Tell them you have it.");
    expect(web.feedItems).not.toContain("Bring it and it");
    expect(web.wantedButton).toContain("`I have ${cardName}.`");
    expect(web.wantedButton).toContain(
      "openThreadAction(flareId, `I have ${cardName}.`)",
    );
    expect(web.wantedButton).toMatch(/\n\s+Message\n/);
    /* Accounts only: the Guest chip has nothing to say on this row. */
    const wantedRow = web.feedItems.slice(
      web.feedItems.indexOf('item.kind === "wanted"'),
      web.feedItems.indexOf('item.kind === "upcoming"'),
    );
    expect(wantedRow).not.toContain("GuestChip");
    expect(wantedRow).not.toContain(">Go<");
  });

  it("in the app", () => {
    expect(app.home).toContain("They already asked. Tell them you have it.");
    expect(app.home).not.toContain("Bring it and it");
    expect(app.home).toContain("`I have ${");
    expect(app.home).toContain("openLocalThread(");
    const wantedRow = app.home.slice(
      app.home.indexOf('item.kind === "wanted"'),
      app.home.indexOf('item.kind === "upcoming"'),
    );
    expect(wantedRow).toContain("Message");
    expect(wantedRow).not.toContain("GuestChip");
  });
});

describe("a thread view never assumes a card", () => {
  it("on the website: the card line only when there is one", () => {
    expect(web.local).toContain("{thread.cardName && (");
    expect(web.local).toContain("{cardName && (");
    expect(web.local).toContain("About {cardName}");
  });

  it("in the app", () => {
    expect(app.local).toMatch(/thread\.cardName\s*(\?|&&)/);
    expect(app.thread).toMatch(/cardName\s*(\?|&&)/);
  });
});

describe("logging a trade", () => {
  const FORM = [
    "I got a card",
    "I gave a card",
    "Their name",
    "Find on CardFlare",
    "Threw in a sleeve, cash on top, whatever you want to remember.",
    "Keep my Have list in step",
    "A card you gave comes off your Have list. A card you got goes on it.",
    "Logged trades earn no Embers. Nobody else confirmed them.",
    "Log it",
  ];

  it("has a Log a trade button on both history screens, hidden behind the wall", () => {
    expect(web.logTrade).toContain("Log a trade");
    expect(web.historyPage).toContain("{!history.locked && (");
    expect(web.historyPage).toContain("<LogTradeButton");
    expect(app.historyScreen).toContain("Log a trade");
    expect(app.root).toContain('title: "Log a trade"');
    expect(app.root).toContain("LogTrade");
  });

  it("asks the same things in the same words on both", () => {
    for (const source of [web.logTrade, app.logTrade]) {
      for (const text of FORM) {
        expect(source, text).toContain(text);
      }
    }
  });

  it("holds the app to the schema's limits without importing across the boundary", () => {
    expect(app.logTrade).not.toContain("logged-schema");
    for (const limit of ["60", "80", "140", "99"]) {
      expect(app.logTrade).toContain(limit);
    }
    expect(app.logTrade).toContain("Today");
    expect(app.logTrade).toContain("Yesterday");
  });

  it("says Logged. once it lands, on both", () => {
    expect(web.logTrade).toContain("Logged.");
    expect(app.historyScreen + app.logTrade).toContain("Logged.");
  });

  it("marks a logged row and lets only that row be removed, on both", () => {
    expect(web.history).toContain("Logged by you");
    expect(web.history).toContain("icon: PenLine");
    expect(web.history).toContain('label: "Remove"');
    expect(web.history).toContain("deleteLoggedTradeAction(trade.id)");
    /* Behind a two-step since round 5: the menu's Remove asks first. */
    expect(web.history).toMatch(/\{logged &&\s+!compact &&\s+\(confirming \?/);
    expect(web.history).toContain("href={`/p/${trade.partnerPlayerId}`}");

    expect(app.history).toContain("Logged by you");
    expect(app.history).toContain("pencil-outline");
    expect(app.history).toContain("Remove");
    expect(app.history).toContain("partnerPlayerId");
  });

  it("filters by direction with the same three chips", () => {
    for (const source of [web.history, app.historyScreen]) {
      for (const label of ['"All"', '"Got"', '"Gave"']) {
        expect(source).toContain(label);
      }
    }
  });

  it("reaches the server the same way from both", () => {
    expect(web.logTrade).toContain("logTradeAction({");
    expect(app.api).toContain("/api/v1/trades/history");
  });
});

describe("a hunt can be answered in full", () => {
  it("never says Not posted yet, on either platform", () => {
    expect(web.huntDetail).not.toContain("Not posted yet");
    expect(app.hunts).not.toContain("Not posted yet");
    expect(app.hunts).not.toContain("postable");
  });

  it("picks by request and sends once, on both", () => {
    expect(web.huntDetail).toContain("useSelection(remainingFor)");
    expect(web.huntDetail).toContain("selection.toggle(card.requestId)");
    expect(web.huntDetail).toContain("requestId: line.key");
    expect(web.huntDetail).not.toContain("card.flareId");

    expect(app.api).toContain("offerOnHunt(");
    expect(app.api).toContain('action: "offer"');
    expect(app.hunts).toContain("offerOnHunt(");
    expect(app.hunts).not.toContain("offerItemsOnPost");
  });

  it("says where each card went, on both", () => {
    expect(web.huntDetail).toContain("Sent to {ownerName} in Messages");
    expect(web.huntDetail).toContain(
      "href={`/local?thread=${encodeURIComponent(outcome.threadId)}`}",
    );
    expect(web.huntDetail).toMatch(/Offered \{outcome\.offered\}/);

    expect(app.hunts).toContain("in Messages");
    expect(app.hunts).toContain("Open in Messages");
    expect(app.hunts).toMatch(/Offered \$\{/);
  });
});
