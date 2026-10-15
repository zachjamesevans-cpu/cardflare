import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Flare tab's list removes a card by swiping it, the iOS way. The
 * founder: "flares on this screen should be swipe to remove (itll show
 * that delete red thing thats build into ios)".
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("a Flare on the list swipes to delete", () => {
  const row = read("mobile/src/want-row.tsx");

  it("is a swipeable row with a red Delete under it", () => {
    expect(row).toContain(
      'import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";',
    );
    expect(row).toContain("renderRightActions=");
    expect(row).toContain(">Delete</Text>");
    expect(row).toMatch(/swipeable\.close\(\);\s*void run\(onDrop\);/);
    expect(row).toContain("return colors.destructive;");
    expect(read("mobile/src/theme.ts")).toContain('destructive: "#ff3b30"');
  });

  it("has no Remove link beside the name any more", () => {
    expect(row).not.toContain(">Remove</Text>");
    expect(row).not.toContain("removeLink");
  });

  it("hides the Delete until the row slides: the row is opaque", () => {
    expect(row).toMatch(/wantRow: \{[\s\S]*?return colors\.surface;/);
  });
});
