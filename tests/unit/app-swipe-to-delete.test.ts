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
    /* The armed tick, once, as the swipe crosses the line. */
    expect(swipe).toContain("if (over) runOnJS(tick)();");
    expect(swipe).toContain("return colors.destructive;");
    expect(swipe).toContain(">\n            Delete\n");
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
