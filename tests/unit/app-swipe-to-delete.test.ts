import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTION_WIDTH,
  pastFullSwipe,
  swipeRelease,
} from "../../mobile/src/swipe-release";

/**
 * The Flare tab's list removes a card by swiping it, the iOS way. The
 * founder: "flares on this screen should be swipe to remove (itll show
 * that delete red thing thats build into ios)", then "you can swipe
 * normally and press it, or swipe a lot more and it 'closes in on
 * itself' and disappears. it should delete immediately visually even
 * if it takes a second for the server to respond."
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("letting go of a swiped row", () => {
  const width = 360;

  it("deletes past half the row", () => {
    expect(swipeRelease(-200, 0, width)).toBe("delete");
    expect(pastFullSwipe(-181, width)).toBe(true);
    expect(pastFullSwipe(-179, width)).toBe(false);
  });

  it("leaves the Delete showing after a short swipe", () => {
    expect(swipeRelease(-ACTION_WIDTH, 0, width)).toBe("open");
    expect(swipeRelease(-60, 0, width)).toBe("open");
  });

  it("closes a nudge, or a flick back to the right", () => {
    expect(swipeRelease(-20, 0, width)).toBe("close");
    expect(swipeRelease(-100, 800, width)).toBe("close");
  });

  it("never deletes before the row has been measured", () => {
    expect(swipeRelease(-500, 0, 0)).not.toBe("delete");
  });
});

describe("the row on screen", () => {
  const swipe = read("mobile/src/swipe-delete.tsx");
  const row = read("mobile/src/want-row.tsx");

  it("slides off, folds shut, then deletes", () => {
    expect(swipe).toMatch(
      /x\.value = withTiming\([\s\S]*?height\.value = withTiming\(0[\s\S]*?runOnJS\(finish\)\(\)/,
    );
    expect(swipe).toContain("return colors.destructive;");
    expect(swipe).toContain(">\n            Delete\n");
  });

  /* "add a bit of haptic feedback once it goes past the mark of
     deletable when swiping. also, it should be a little more 'bouncy'
     when the swipe to delete thing opens." */
  it("ticks across the line, and springs open with a bounce", () => {
    expect(swipe).toContain("runOnJS(tick)(over);");
    expect(swipe).toContain("Haptics.ImpactFeedbackStyle.Medium");
    expect(swipe).toMatch(/const OPEN = \{ damping: 12,/);
    expect(swipe).toContain(
      "withSpring(-ACTION_WIDTH, { ...OPEN, velocity: event.velocityX })",
    );
  });

  /* "tapping anywhere on the screen removes that delete button
     visibility ... a delete button can be simultaneously viewed on all." */
  it("shows one Delete at a time, and a touch anywhere closes it", () => {
    expect(swipe).toContain("if (shown && shown.id !== self) dismissSwipe();");
    expect(swipe).toMatch(
      /export function dismissSwipe\([\s\S]*?shown\.onDelete\(pageX, pageY\)\) return;/,
    );
    const composer = read("mobile/src/screens/flare-composer.tsx");
    expect(composer).toMatch(
      /onTouchStart=\{\(event\) =>\s*dismissSwipe\(event\.nativeEvent\.pageX, event\.nativeEvent\.pageY\)/,
    );
    expect(composer).toContain("onScrollBeginDrag={() => dismissSwipe()}");
  });

  it("is what the Flare list's rows wear, with no Remove link", () => {
    expect(row).toContain("<SwipeToDelete");
    expect(row).not.toContain(">Remove</Text>");
    expect(row).toMatch(/wantRow: \{[\s\S]*?return colors\.surface;/);
  });

  it("drops the card from the list before the server answers", () => {
    const hub = read("mobile/src/screens/hub.tsx");
    expect(hub).toMatch(
      /onDrop=\{\(\) => \{\s*setWants\(\(list\) => \{[\s\S]*?filter\(\(row\) => row\.id !== want\.id\)[\s\S]*?return editWant\(/,
    );
  });
});

/* "upon swiping to delete, the card delete for a second, then comes
   right back": demo mode never sends the delete, and the list is a real
   read, so demo mode remembers the delete and leaves the card out. */
describe("a delete in demo mode", () => {
  it("stays deleted when the real list is read back", () => {
    const server = read("mobile/src/demo/demo-server.ts");
    expect(server).toContain(
      'if (method === "DELETE" && parts[2] === "wants" && parts[3]) {',
    );
    expect(server).toContain("droppedWants.add(parts[3]);");
    expect(server).toContain("!droppedWants.has(want.id)");
  });
});
