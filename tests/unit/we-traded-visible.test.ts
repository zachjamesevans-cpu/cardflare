import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WE_TRADED } from "@/lib/trades/thread-trade-copy";
import { WE_TRADED as APP_WE_TRADED } from "../../mobile/src/thread-trade-copy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * "We traded" is the action a conversation exists to end in, and for a
 * while the only way to it was the chat header's "⋯". The audit that
 * put it in conversations had already said what that costs: "zero
 * confirmed trades in 30 days suggests confirming is too hard". It is
 * a button by the composer now, on both platforms, and these fail if
 * it goes back into the menu alone.
 */
describe("We traded is in plain sight in a conversation", () => {
  it("has one name on both platforms", () => {
    expect(WE_TRADED).toBe("We traded");
    expect(APP_WE_TRADED).toBe(WE_TRADED);
  });

  it("is drawn by the website's trade block whoever controls the form", () => {
    const block = read("src/components/local/thread-trade-block.tsx");
    /* The trigger no longer hides when the thread screen holds the state. */
    expect(block).not.toContain("!controlled && (");
    expect(block).toMatch(
      /\) : \(\s*<TradeTrigger onClick=\{\(\) => setOpen\(true\)\} className="self-start" \/>\s*\)\}/,
    );
    expect(block).toContain("{WE_TRADED}");
    /* A pill, not the muted text link it was. */
    expect(block).toContain("rounded-full border border-accent/40 bg-accent/10");
  });

  it("is drawn by the app's thread under the composer, with the same rule as the menu", () => {
    const thread = read("mobile/src/screens/thread.tsx");
    expect(thread).toContain(
      "const canSayTraded = !blocked && !closed && !tradePending && !tradeOpen;",
    );
    expect(thread).toMatch(/\{canSayTraded \? \(\s*<Tap\s+onPress=\{openTradeForm\}/);
    expect(thread).toMatch(
      /\.\.\.\(canSayTraded\s*\?\s*\[\s*\{\s*key: "traded",\s*label: WE_TRADED,/,
    );
  });

  it("keeps the row in the menu on both, for the thumb that learned it there", () => {
    expect(read("src/components/local/local-screen.tsx")).toContain(
      'label: "We traded",',
    );
    expect(read("mobile/src/screens/thread.tsx")).toContain('key: "traded",');
  });
});
