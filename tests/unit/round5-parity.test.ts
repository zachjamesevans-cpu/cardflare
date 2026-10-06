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
 * Round 5, the audit round, both platforms: a Flare's second exit
 * ("Take down", with its minute of Undo), the Messages door in the
 * Inbox, dates drawn in the reader's clock, and the copy the audit
 * sent back.
 *
 * Read off the source, because parity is about the same sections, the
 * same wording and the same order on the website and in the app. The
 * strings here are the ones the brief fixed; a platform that says it
 * differently fails here before it ships.
 */

const web = {
  postMenu: read("src/components/feed/post-actions.tsx"),
  undoToast: read("src/components/feed/undo-toast.tsx"),
  roomControls: read("src/components/lists/remove-entry.tsx"),
  board: read("src/components/lists/list-entries.tsx"),
  flares: read("src/components/players/want-entries.tsx"),
  inbox: read("src/app/inbox/page.tsx"),
  local: read("src/app/local/page.tsx"),
  tabs: read("src/components/players/player-tabs.tsx"),
  tabBar: read("src/components/players/player-tab-bar.tsx"),
  profileHeader: read("src/components/players/profile-header.tsx"),
  history: read("src/components/trades/history.tsx"),
  localDate: read("src/components/ui/local-date.tsx"),
  logTrade: read("src/components/trades/log-trade-sheet.tsx"),
  feedCard: read("src/components/feed/flare-feed-card.tsx"),
  roomDoor: read("src/components/events/room-door.tsx"),
  notify: read("src/lib/notifications/notify.ts"),
  profile: read("src/app/profile/page.tsx"),
  settings: read("src/app/profile/settings/page.tsx"),
  embersStore: read("src/app/profile/store/page.tsx"),
  zoom: read("src/components/cards/card-image-zoom.tsx"),
};

const app = {
  postMenu: read("mobile/src/flare-feed-card.tsx"),
  undoToast: read("mobile/src/undo-toast.tsx"),
  room: read("mobile/src/screens/room.tsx"),
  inbox: read("mobile/src/screens/inbox.tsx"),
  profileHeader: read("mobile/src/profile-header.tsx"),
  historyScreen: read("mobile/src/screens/trade-history.tsx"),
  logTrade: read("mobile/src/screens/log-trade.tsx"),
  feedCard: read("mobile/src/flare-feed-card.tsx"),
  embersStore: read("mobile/src/screens/store.tsx"),
  ui: read("mobile/src/ui.tsx"),
  api: read("mobile/src/api.ts"),
};

describe("a Flare has two exits: Found it and Take down", () => {
  it("puts Take down last in both post menus, on your own post only", () => {
    expect(web.postMenu).toContain('label: "Take down"');
    expect(web.postMenu).toContain("<Trash2 />");
    expect(web.postMenu).toContain("if (post.yours) {");
    expect(web.postMenu).toContain("takeDownPostAction(post.postId)");
    /* After Update progress, never before it. */
    expect(web.postMenu.indexOf('label: "Take down"')).toBeGreaterThan(
      web.postMenu.indexOf('label: "Update progress"'),
    );

    expect(app.postMenu).toContain('label: "Take down"');
    expect(app.postMenu).toContain('icon: "trash-outline"');
    expect(app.postMenu.indexOf('label: "Take down"')).toBeGreaterThan(
      app.postMenu.indexOf('label: "Update progress"'),
    );
  });

  it("keeps Update progress exactly as it was", () => {
    expect(web.postMenu).toContain('label: "Update progress"');
    expect(web.postMenu).toContain('post.direction === "want"');
    expect(app.postMenu).toContain('label: "Update progress"');
  });

  it("offers an Undo for a minute, on both, through the same two doors", () => {
    expect(web.undoToast).toContain("Taken down.");
    expect(web.undoToast).toMatch(/\n\s+Undo\n/);
    expect(web.undoToast).toContain("UNDO_TOAST_MS = 60 * 1000");
    expect(web.undoToast).toContain("restoreFlaresAction(state.flareIds, state.code)");
    /* The host outlives the post: it rides with the tab bar. */
    expect(web.tabBar).toContain("<UndoToastHost />");

    expect(app.undoToast).toContain("Taken down.");
    expect(app.undoToast).toContain("Undo");
    expect(app.api).toContain('action: "take-down"');
    expect(app.api).toContain('action: "restore"');
    expect(app.api).toContain('mode: "take-down"');
    expect(app.api).toContain('mode: "restore"');
  });

  it("gives the room board Found it and Take down in place of Remove, on both", () => {
    expect(web.roomControls).toMatch(/\n\s+Found it\n/);
    expect(web.roomControls).toMatch(/\n\s+Take down\n/);
    expect(web.roomControls).toContain("takeDownRoomFlareAction(code, flareId)");
    expect(web.roomControls).toContain("removeListEntryAction");
    expect(web.roomControls).not.toMatch(/\n\s+Remove\n/);
    /* Red-ish through the token, never a literal. */
    expect(web.roomControls).toContain("text-danger");

    expect(app.room).toContain("Found it");
    expect(app.room).toContain("Take down");
  });

  it("leads your own section with what you just posted, on both", () => {
    expect(web.board).toContain(
      "[...group.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))",
    );
    expect(app.room).toMatch(/createdAt/);
  });

  it("says Found, never Live, on a card whose every copy is found", () => {
    expect(web.flares).toContain("want.found ?");
    expect(web.flares).toMatch(/\n\s+Found\n/);
  });
});

describe("the Messages door in the Inbox", () => {
  const SENTENCE = "Conversations about cards, and with players you message.";

  it("is gone from both inboxes: Messages has its own tab", () => {
    /* The founder: "Remove the 'messages' thing inside notifications
       it's not needed anymore since it has its own button". */
    expect(web.inbox).not.toContain(SENTENCE);
    expect(web.inbox).not.toContain('href="/local"');
    expect(web.inbox).not.toContain("unreadMessages(");
    expect(app.inbox).not.toContain(SENTENCE);
    expect(app.inbox).not.toContain("chatbubble");
    expect(app.inbox).not.toContain('screen: "Messages"');
  });

  it("keeps the Messages tab lit while a conversation is read", () => {
    /* Round 16: Messages is a tab of its own, so the page has no way
       back to the Inbox; the tab owns /local, conversation open or not. */
    expect(web.local).not.toContain('href="/inbox"');
    expect(web.tabs).toContain('label: "Messages"');
    expect(web.tabs).toContain('!LOCAL_ENABLED && pathname.startsWith("/local")');
  });
});

describe("dates render once, in the reader's clock", () => {
  it("draws every trade date through LocalDate", () => {
    expect(web.history).toContain(
      'import { formatLocalDate, LocalDate, useMounted } from "@/components/ui/local-date"',
    );
    expect(web.history).toContain('<LocalDate iso={trade.confirmedAt} format="day" />');
    /* Round 16: History's months hold trades and past Flares, each
       dated by `at` (a trade's confirmedAt, a Flare's endedAt). */
    expect(web.history).toContain(
      '<LocalDate iso={month.items[0].at} format="month" />',
    );
    /* The month groups follow the reader's clock, not the server's. */
    expect(web.history).toContain('monthOf(item.at, mounted ? undefined : "UTC")');
    /* The helpers stay exported for anything that already has a clock. */
    expect(web.history).toContain("export function dayOf(");
    expect(web.history).toContain("export function monthOf(");
  });

  it("renders nothing on the server and the date after mount", () => {
    expect(web.localDate).toContain('"use client"');
    expect(web.localDate).toContain("useSyncExternalStore");
    expect(web.localDate).toContain('() => "",');
    expect(web.localDate).toContain('aria-hidden="true"');
  });
});

describe("the small bugs", () => {
  it("says now, not 1m ago, under a minute on both", () => {
    expect(web.feedCard).toContain('if (seconds < 60) return "now";');
    expect(app.feedCard).toContain('"now"');
  });

  it("pluralises followers by count on both profile headers", () => {
    expect(web.profileHeader).toMatch(/followers === 1 \? "follower" : "followers"/);
    expect(app.profileHeader).toMatch(/followers === 1 \? "follower" : "followers"/);
  });

  it("folds the room's roster to one face per person", () => {
    expect(web.roomDoor).toContain("export function dedupeParticipants(");
    expect(web.roomDoor).toContain(
      "participant.playerId ?? participant.playerSessionId",
    );
    expect(web.roomDoor).toContain(
      "dedupeParticipants(people.participants, people.youId)",
    );
  });

  it("removes a logged trade in two taps, and lets Logged. go stale, on both", () => {
    expect(web.history).toContain("Remove this trade?");
    expect(web.history).toMatch(/\n\s+Keep\n/);
    expect(web.history).toContain("onSelect: () => setConfirming(true)");
    expect(web.logTrade).toContain("setTimeout(() => setLogged(false), 4000)");

    /* The app asks through the system alert: Cancel, then Remove. */
    expect(app.historyScreen).toContain('Alert.alert("Remove this trade?"');
    expect(app.historyScreen).toContain('{ text: "Cancel", style: "cancel" }');
  });

  it("names the room on the post's header line, keeping the footer button, on both", () => {
    expect(web.feedCard).toContain("at {item.storeName}");
    expect(web.feedCard).toContain("Go to {item.storeName}");
    expect(app.feedCard).toMatch(/at \$\{item\.storeName\}|at \{item\.storeName\}/);
  });
});

describe("copy the audit sent back", () => {
  it("never says Trade partners. or nothing to pledge, on either platform", () => {
    for (const source of Object.values(web)) {
      expect(source).not.toContain("Trade partners.");
      expect(source).not.toContain("nothing to pledge");
    }
    for (const source of Object.values(app)) {
      expect(source).not.toContain("Trade partners.");
      expect(source).not.toContain("nothing to pledge");
    }
    expect(web.notify.match(/Follow back and you're trade partners\./g)).toHaveLength(
      2,
    );
    expect(web.profile).toContain("nothing to offer on here");
  });

  it("says the same sentences where the string exists on both", () => {
    const PLACE = "A store, a kitchen table, a parking lot";
    expect(web.logTrade).toContain(PLACE);
    expect(app.logTrade).toContain(PLACE);

    const BORDER = "Buying a border unlocks it for your profile and your cards.";
    expect(web.embersStore).toContain(BORDER);
    expect(app.embersStore).toContain(BORDER);

    /*
     * The zoom's offer is a bar at the FOOT of the panel on both: one
     * full-width button, the note behind "Add a note", and the one
     * sentence that changes a decision. The founder: "the offer thing
     * is just kinda ugly, and really should be at the bottom if
     * anything so it's easier to reach." The explaining line
     * ("Replies on their Flare and lets them know.") went with the box.
     */
    const OFFERED = "Somebody already offered. You can too.";
    for (const zoom of [web.zoom, app.ui]) {
      expect(zoom).toContain(OFFERED);
      expect(zoom).toContain("Add a note");
      expect(zoom).not.toContain("lets them know");
    }
    expect(web.zoom.indexOf("<ZoomHaveBlock")).toBeGreaterThan(
      web.zoom.indexOf("aspect-[60/84]"),
    );
    expect(app.ui.indexOf("<ZoomHaveForm")).toBeGreaterThan(
      app.ui.indexOf("snapToInterval={page}"),
    );
    /* ...and before the close in the panel's corner, which is drawn last
       so it sits over the title (round 13's X, in place of the old
       "tap anywhere" line). */
    expect(app.ui.indexOf("<ZoomHaveForm")).toBeLessThan(
      app.ui.indexOf('accessibilityLabel="Close"'),
    );

    expect(web.settings).toContain("Your account, Feed and room preferences.");
  });
});
