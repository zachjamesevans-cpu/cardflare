import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as webNight from "@/lib/events/night-copy";
import { NO_TIMEZONE_CREATE } from "@/lib/events/schema";
import * as appNight from "../../mobile/src/night-copy";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/** The source between two markers, or "" when either is missing. */
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from === -1 || to === -1 ? "" : source.slice(from, to);
};

/** Prettier wraps JSX text, so a sentence is matched with its breaks folded. */
const folded = (source: string) => source.replace(/\s+/g, " ");

/** The string literal an `export const NAME =` holds, or "" when it is not there. */
const exported = (source: string, name: string) => {
  const match = source.match(new RegExp(`const ${name} =\\s*"([^"]*)"`));
  return match ? match[1] : "";
};

/**
 * Round 17, both platforms: the copy the audit of 2026-10-03 flagged,
 * the stores' console, the admin console, and Block behind a post.
 *
 * The founder's standing instruction is that every change ships to
 * the website and the app alike: same sections, same wording, same
 * buttons, same order. The exact strings below are the brief's, so
 * this reads both sources and holds them together word for word.
 */

const web = {
  feed: read("src/lib/feed/repository.ts"),
  lobby: read("src/components/events/event-lobby.tsx"),
  earlyPicker: read("src/components/events/early-board-picker.tsx"),
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  createEvent: read("src/components/events/create-event-form.tsx"),
  eventsPage: read("src/app/store/events/page.tsx"),
  eventPage: read("src/app/store/events/[id]/page.tsx"),
  editEvent: read("src/components/events/edit-event-form.tsx"),
  createShow: read("src/components/shows/create-show-form.tsx"),
  showsPage: read("src/app/admin/shows/page.tsx"),
  showActions: read("src/lib/shows/actions.ts"),
  storePage: read("src/app/admin/stores/[id]/page.tsx"),
  mergePanel: read("src/components/admin/merge-panel.tsx"),
  progressSheet: read("src/components/feed/flare-progress-sheet.tsx"),
  huntDetail: read("src/components/players/hunt-detail.tsx"),
  postActions: read("src/components/feed/post-actions.tsx"),
  hiddenPosts: read("src/components/feed/hidden-posts.ts"),
  feedCard: read("src/components/feed/flare-feed-card.tsx"),
  feedCardCompact: read("src/components/feed/flare-feed-card-compact.tsx"),
  blockControls: read("src/components/players/block-controls.tsx"),
};

const app = {
  api: read("mobile/src/api.ts"),
  roomPeople: read("mobile/src/room-people.tsx"),
  ui: read("mobile/src/ui.tsx"),
  progressSheet: read("mobile/src/flare-progress-sheet.tsx"),
  huntsPanel: read("mobile/src/hunts-panel.tsx"),
  feedCard: read("mobile/src/flare-feed-card.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
};

const BOARD_EARLY_LONG =
  "Everyone here is still on their way. Post what you're looking for now, so people know what to bring from home. Flares from players who never make it are cleared when the event ends.";
const EARLY_PICKER_LINE =
  "Flares from anyone who never shows are cleared when the event ends.";
const VIEWER_LINE = "They will see your name and can message you.";
const CANCEL_EMPTY = "Nobody has joined yet, so this night will be removed. Cancel it?";
const CANCEL_JOINED = "Players who joined will see it closed. Cancel it?";
const MERGE_LINE =
  "Everything on this store moves to the store you pick, then this store is deleted. This cannot be undone.";
const BLOCKED_LINE = "Blocked. Their posts are hidden and they cannot message you.";
const BLOCK_CONFIRM =
  "You will not see their posts, and neither of you can message the other. They are not told.";

describe("the Feed's Coming up section", () => {
  it("is titled Coming up on both platforms, under the key tonight", () => {
    expect(web.feed).toContain('tonight: "Coming up"');
    expect(app.api).toContain('tonight: "Coming up"');
    expect(web.feed).not.toContain('tonight: "Tonight"');
    expect(app.api).not.toContain('tonight: "Tonight"');
  });
});

describe("the room lobby's count line", () => {
  it("says coming, not tonight, on both platforms", () => {
    expect(web.lobby).toContain("· {participants.length} coming · {flareCount}");
    expect(app.roomPeople).toContain("`${hereNow} here now · ${people.length} coming`");
    expect(web.lobby).not.toContain("{participants.length} tonight");
    expect(app.roomPeople).not.toContain("${people.length} tonight");
  });
});

describe("the early board copy", () => {
  it("says the event ends, on both platforms and in the store's picker", () => {
    expect(webNight.BOARD_EARLY_LONG).toBe(BOARD_EARLY_LONG);
    expect(appNight.BOARD_EARLY_LONG).toBe(BOARD_EARLY_LONG);
    expect(web.earlyPicker).toContain(EARLY_PICKER_LINE);
    expect(web.earlyPicker).not.toContain("when the night ends");
  });
});

describe("the Feed viewer after offering", () => {
  it("says they will see your name and can message you, on both platforms", () => {
    const webBlock = folded(between(web.zoom, "function ZoomHaveBlock", "const added"));
    expect(webBlock).toContain(
      `<span className="font-medium text-accent">You offered this.</span> ${VIEWER_LINE}`,
    );
    expect(webBlock).toContain(`</span>{" "} ${VIEWER_LINE}`);
    expect(webBlock).not.toContain("keep an eye out");

    const appBlock = folded(between(app.ui, "have?.youOffered", "if (!strip"));
    expect(appBlock).toContain(`You offered this.{" "} </Text> ${VIEWER_LINE}`);
    expect(app.ui.split(VIEWER_LINE).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe("the store's Create event button", () => {
  it("takes a disabledReason and prints it as a status line", () => {
    expect(web.createEvent).toContain("disabledReason?: string;");
    expect(web.createEvent).toContain(
      "<SubmitButton disabled={disabled || Boolean(disabledReason)} />",
    );
    expect(folded(web.createEvent)).toContain(
      '<p role="status" className="text-sm text-text-muted"> {disabledReason} </p>',
    );
  });

  it("is told why it waits when the store has no time zone", () => {
    expect(NO_TIMEZONE_CREATE).toBe(
      "Set your store's time zone above to create an event.",
    );
    expect(web.eventsPage).toContain(
      "disabledReason={noZone ? NO_TIMEZONE_CREATE : undefined}",
    );
    expect(web.eventsPage).toContain(
      'import { NO_TIMEZONE, NO_TIMEZONE_CREATE } from "@/lib/events/schema";',
    );
  });
});

describe("the store's event page", () => {
  it("heads the stats by whether the room is over", () => {
    expect(web.eventPage).toContain(
      '{roomOver ? "How the room went" : "The room so far"}',
    );
    expect(web.eventPage).toContain(
      'const roomOver = event.status === "closed" || Boolean(event.cancelled_at);',
    );
  });

  it("tells the cancel form how many joined", () => {
    expect(web.eventPage).toContain(
      "<CancelEventForm eventId={event.id} joined={participants.length} />",
    );
  });

  it("confirms a cancel by who has joined", () => {
    expect(webNight.CANCEL_EMPTY).toBe(CANCEL_EMPTY);
    expect(webNight.CANCEL_JOINED).toBe(CANCEL_JOINED);
    expect(web.editEvent).toContain("joined: number;");
    expect(web.editEvent).toContain("{joined === 0 ? CANCEL_EMPTY : CANCEL_JOINED}");
    expect(web.editEvent).toContain(
      'import { CANCEL_EMPTY, CANCEL_JOINED } from "@/lib/events/night-copy";',
    );
  });
});

describe("the admin's new show form", () => {
  it("offers no UTC and opens on a placeholder a real zone replaces", () => {
    expect(web.createShow).not.toContain("UTC (no timezone set)");
    expect(web.createShow).not.toContain("defaultZone");
    expect(web.showsPage).not.toContain("defaultZone");
    expect(web.showsPage).not.toContain('timeZoneChoices("UTC")');
    const select = between(web.createShow, 'name="timezone"', "</Select>");
    expect(select).toContain("required");
    expect(select).toContain('defaultValue=""');
    expect(folded(select)).toContain(
      '<option value="" disabled> Choose a timezone </option>',
    );
  });

  it("is refused by the server without a zone", () => {
    expect(web.showActions).toContain(
      `fieldErrors: { timezone: "Pick the venue's timezone." }`,
    );
    expect(web.showActions).not.toContain('text(formData, "timezone") || "UTC"');
  });
});

describe("the admin's store page", () => {
  it("keeps the merge inside the Danger zone, before the delete", () => {
    expect(web.storePage).not.toContain("merge-heading");
    const danger = between(
      web.storePage,
      'aria-labelledby="danger-heading"',
      "</section>",
    );
    expect(danger).toContain("Danger zone");
    expect(danger).toContain("<MergePanel");
    expect(danger).toContain("<DeletePanel");
    expect(danger.indexOf("<MergePanel")).toBeLessThan(danger.indexOf("<DeletePanel"));
  });

  it("says what a merge does, in the panel under its own heading", () => {
    expect(exported(web.mergePanel, "MERGE_LINE")).toBe(MERGE_LINE);
    expect(web.mergePanel).toContain("export const MERGE_LINE");
    expect(web.mergePanel).toContain("Merge into another store");
    expect(web.mergePanel).toContain("{MERGE_LINE}");
  });
});

describe("the progress rows", () => {
  const files = {
    "web progress sheet": web.progressSheet,
    "web hunt detail": web.huntDetail,
    "app progress sheet": app.progressSheet,
    "app hunts panel": app.huntsPanel,
  };

  it("have one control, the stepper, on both platforms", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toContain("+1 found");
      expect(source, name).toContain("<Stepper");
      expect(source, name).toContain("Undo");
    }
  });

  it("carry the card number on the meta line, then the found line", () => {
    expect(web.progressSheet).toContain(
      '{row.card.cardNumber} · {row.card.printingLabel ?? "Any printing"}',
    );
    expect(web.progressSheet).toContain("{row.found} of {row.needed} found");
    expect(web.progressSheet).toContain("wantsLine(row.needed, row.remaining)");
    expect(web.huntDetail).toContain(
      '{card.cardNumber} · {card.printingLabel ?? "Any printing"}',
    );
    expect(web.huntDetail).toContain("{card.foundCopies} of {card.needed} found");
    expect(app.progressSheet).toContain(
      "{`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}",
    );
    expect(app.huntsPanel).toContain(
      "{`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}",
    );
  });
});

describe("Block behind somebody else's post", () => {
  it("is the item after Report, on both platforms", () => {
    const webMenu = between(
      web.postActions,
      'key: "report"',
      "if (items.length === 0)",
    );
    expect(webMenu).toContain('label: "Report"');
    expect(webMenu).toContain('label: "Block"');
    expect(webMenu).toContain("icon: <Ban />");
    expect(webMenu).toContain("if (!post.yours && post.playerId)");
    expect(web.postActions).toContain(
      'import { Ban, Flag, LayoutList, ListChecks, Trash2 } from "lucide-react";',
    );

    const appMenu = between(app.feedCard, 'key: "report"', "return items;");
    expect(appMenu).toContain('label: "Report"');
    expect(appMenu).toContain('label: "Block"');
    expect(appMenu).toContain('icon: "ban-outline"');
    expect(app.feedCard).toContain("onBlock?: () => void;");
  });

  it("confirms in the profile's words, then blocks and hides every post by them", () => {
    expect(folded(web.blockControls)).toContain(BLOCK_CONFIRM);
    expect(folded(web.postActions)).toContain(BLOCK_CONFIRM);
    expect(web.postActions).toContain("blockPlayerAction(playerId)");
    expect(web.postActions).toContain("hideAuthor(playerId)");
    expect(exported(web.postActions, "BLOCKED_LINE")).toBe(BLOCKED_LINE);
    expect(web.postActions).toContain(
      "showUndoToast({ message: BLOCKED_LINE, flareIds: [] })",
    );
    expect(web.hiddenPosts).toContain("export function hideAuthor(playerId: string)");
    expect(web.hiddenPosts).toContain("export function useAuthorHidden(");
    expect(web.postActions).toContain(
      "const authorHidden = useAuthorHidden(playerId);",
    );

    expect(app.playerProfile).toContain(BLOCK_CONFIRM);
    expect(app.home).toContain(BLOCK_CONFIRM);
    expect(app.home).toContain("blockPlayer(playerId)");
    expect(exported(app.home, "BLOCKED_LINE")).toBe(BLOCKED_LINE);
  });

  it("knows the author on the web post shape, and both Feed cards carry it", () => {
    const shape = between(web.postActions, "export interface PostShape", "}");
    expect(shape).toContain("playerId: string | null;");
    expect(shape).toContain("playerName: string;");
    for (const source of [web.feedCard, web.feedCardCompact]) {
      expect(source).toContain("playerId: item.playerId || null,");
      expect(source).toContain("playerName: item.displayName,");
      expect(source).toContain("<UnlessHidden postId={item.postId} playerId=");
    }
  });
});
