import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tray = readFileSync("mobile/src/card-tray.tsx", "utf8");

/**
 * The card tray's drag, after the founder filmed it: "super tweaked
 * out when a card goes over itself. Make it much smoother." Three
 * rules keep it smooth; each is pinned so a rewrite cannot quietly
 * bring the flicker back.
 */
describe("dragging a card in the tray", () => {
  it("never re-lays the row out while a finger is down: the held card is an overlay", () => {
    expect(tray).toContain("function HeldCard({");
    expect(tray).toContain('position: "absolute"');
    /* The picked-up tile keeps its place as an invisible placeholder. */
    expect(tray).toContain("opacity: placeholder ? 0 : 1,");
    /* The list is rendered from the props, not from a mid-drag order. */
    expect(tray).toContain("{items.map((item, index) => (");
    expect(tray).not.toContain("applyOrder(");
  });

  it("changes slot only past a dead zone, so a card on the line cannot flicker", () => {
    expect(tray).toContain("const DEAD_ZONE = 0.6;");
    expect(tray).toContain("if (Math.abs(away) < DEAD_ZONE) return;");
    expect(tray).toContain("slot.value = withSpring(wanted, SPRING);");
  });

  it("lands before it commits: the order changes only once the overlay has arrived", () => {
    expect(tray).toContain(
      "dragX.value = withTiming((toIndex - fromIndex) * SLOT, DROP, (finished) => {",
    );
    expect(tray).toContain("if (finished) runOnJS(land)(fromIndex, toIndex);");
    /* One render swaps overlay for tile: held cleared and reorder told together. */
    expect(tray).toMatch(
      /setHeld\(null\);\s*if \(fromIndex !== toIndex\) onReorder\(fromIndex, toIndex\);/,
    );
  });

  it("does not check a build into the repo", () => {
    expect(readFileSync(".gitignore", "utf8")).toContain("mobile/*.ipa");
  });
});
