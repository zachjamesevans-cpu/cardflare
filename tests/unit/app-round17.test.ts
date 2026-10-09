import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as nightCopy from "../../mobile/src/night-copy";

/* A file that is not there reads as empty, so every pin on it fails
   by name instead of the whole suite failing to load. */
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

/**
 * Round 17 in the app: the copy the audit of 2026-10-03 flagged, the
 * one progress control, and Block behind the three dots.
 *
 * The audit's rows, as they land on a phone: the Feed's "Tonight"
 * section is "Coming up"; the lobby counts "coming", not "tonight";
 * the early board clears "when the event ends"; the viewer tells an
 * offerer "They will see your name and can message you."; the
 * "+1 found" tap beside the stepper is gone from both progress rows,
 * and the meta line carries the card number; and somebody else's post
 * offers "Block" after "Report", in the profile's words.
 */
const src = {
  api: read("mobile/src/api.ts"),
  people: read("mobile/src/room-people.tsx"),
  ui: read("mobile/src/ui.tsx"),
  sheet: read("mobile/src/flare-progress-sheet.tsx"),
  hunts: read("mobile/src/hunts-panel.tsx"),
  /* "Hunts drawn like binders": the owner's progress row is the pocket
     sheet on the hunt's page, one card at a time. */
  huntPage: read("mobile/src/hunt-binder.tsx"),
  card: read("mobile/src/flare-feed-card.tsx"),
  compact: read("mobile/src/flare-feed-card-compact.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  profile: read("mobile/src/screens/player-profile.tsx"),
};

describe("the Feed and the room say what the audit asked", () => {
  it('heads the section "Coming up" under the same key', () => {
    const titles = between(src.api, "export const SECTION_TITLES", "};");
    expect(titles).toContain('tonight: "Coming up",');
    expect(titles).not.toContain('"Tonight"');
  });

  it('counts the lobby as "coming"', () => {
    expect(src.people).toContain("`${people.length} coming`");
    expect(src.people).not.toContain("} here now");
    expect(src.people).not.toContain("${people.length} tonight");
  });

  it('clears the early board "when the event ends"', () => {
    expect(nightCopy.BOARD_EARLY_LONG).toBe(
      "Everyone here is still on their way. Post what you're looking for now, so people know what to bring from home. Flares from players who never make it are cleared when the event ends.",
    );
  });

  it("tells an offerer they will be seen and can be messaged", () => {
    /* The viewer's strips, after the offer strip helper; the offer
       controls above keep their own line. */
    const viewer = src.ui.slice(src.ui.indexOf("function offeredStrip("));
    expect(viewer).toContain("You offered this.");
    expect(viewer).toContain("They will see your name and can message you.");
    expect(viewer).not.toContain("keep an eye out");
    /* The accent holds "You offered this." and the rest follows it. */
    const have = between(viewer, "have?.youOffered", "</ZoomSaid>");
    expect(have).toContain('fontWeight: "600" }}>');
    expect(have.indexOf("You offered this.")).toBeLessThan(
      have.indexOf("They will see your name and can message you."),
    );
  });
});

describe("the stepper is the one progress control", () => {
  const sheetRow = between(src.sheet, "{open.cards.map((card) => {", "</ScrollView>");
  const huntRow = src.huntPage.slice(src.huntPage.indexOf("function HuntPocketSheet("));

  it('has no "+1 found" tap on either row', () => {
    for (const [name, source] of [
      ["sheet", src.sheet],
      ["hunts", src.hunts],
      ["hunt page", src.huntPage],
    ] as const) {
      expect(source, name).not.toContain("+1 found");
      expect(source, name).not.toContain("One more ${card.cardName} found");
    }
  });

  it("draws one stepper where the tap was, and keeps Undo", () => {
    expect(sheetRow.match(/<Stepper/g)?.length).toBe(1);
    expect(sheetRow).toContain("onChange={(value) => write(card, value)}");
    /* Nothing stacks on the right any more: the stepper sits in the row. */
    expect(sheetRow).not.toContain('alignItems: "flex-end"');
    expect(src.sheet).toContain("<UndoLine label={copies.undoLabel}");

    const owner = between(huntRow, '<View style={{ marginTop: "auto" }}>', "</View>");
    expect(owner.match(/<Stepper/g)?.length).toBe(1);
    expect(owner).toContain("onChange={(value) => onSet(value)}");
    expect(owner).not.toContain("<Tap");
    expect(src.huntPage).toContain("<UndoLine label={copies.undoLabel}");
  });

  it("puts the card number before the printing on the meta line", () => {
    const meta = "`${card.cardNumber} · ${printingLabel(card.printingLabel)}`";
    expect(sheetRow).toContain(meta);
    expect(huntRow).toContain(meta);
    /* Then the found line as before, with the want line. */
    expect(sheetRow).toContain("${have} of ${total} found");
    expect(sheetRow).toContain("wantsLine(total, left)");
    expect(huntRow).toContain("${found} of ${needed} found");
    expect(huntRow).toContain("wantsLine(needed, remaining)");
  });
});

describe("Block sits behind the three dots on somebody else's post", () => {
  it('offers "Block" after "Report", never on your own, never on a store', () => {
    const actions = between(src.card, "export function postActions(", "return items;");
    expect(actions).toContain("onBlock?: () => void;");
    const report = actions.indexOf('label: "Report"');
    const block = actions.indexOf('label: "Block"');
    expect(report).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(report);
    const item = between(actions, "if (!yours && onBlock) {", "}");
    expect(item).toContain('key: "block"');
    expect(item).toContain('icon: "ban-outline"');
    expect(item).toContain("onPress: onBlock");
    /* The card takes the handler and hands it to the menu. */
    expect(src.card).toContain("onBlock,\n  onOpenHunt,");
    expect(between(src.card, "const actions = postActions({", "});")).toContain(
      "onBlock,",
    );
    /* The Feed only passes it when there is a player to block, to the
       classic card and the compact one alike: one menu in both views. */
    expect(src.home.match(/item\.yours \|\| !item\.playerId/g)?.length).toBe(2);
    expect(src.home.match(/block\(item\.playerId, item\.displayName\)/g)?.length).toBe(
      2,
    );
    expect(src.compact).toContain("onBlock?: () => void;");
    expect(between(src.compact, "const actions = postActions({", "});")).toContain(
      "onBlock,",
    );
  });

  it("asks the profile's question in the profile's words", () => {
    const question =
      "You will not see their posts, and neither of you can message the other. They are not told.";
    expect(src.profile).toContain(question);
    const confirm = between(src.home, "Alert.alert(", ");");
    expect(confirm).toContain("`Block ${name}?`");
    expect(confirm).toContain(question);
    expect(confirm).toContain('text: "Keep", style: "cancel"');
    expect(confirm).toContain('text: "Block", style: "destructive"');
  });

  it("blocks, drops their posts at once, and says so the way a take-down does", () => {
    const after = between(
      src.home,
      "const blockNow = async (playerId: string) => {",
      "};",
    );
    expect(after).toContain("await blockPlayer(playerId);");
    expect(after).toContain('entry.kind === "hunt" && entry.playerId === playerId');
    expect(after).toContain("markFeedStale();");
    expect(after).toContain("message: BLOCKED_LINE,");
    expect(after).toContain("await unblockPlayer(playerId)");
    expect(src.home).toContain(
      'const BLOCKED_LINE = "Blocked. Their posts are hidden and they cannot message you.";',
    );
    /* The same toast strip the take-down uses. */
    expect(src.home).toContain("<UndoToast offer={undo}");
  });
});
