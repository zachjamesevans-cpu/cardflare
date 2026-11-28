import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { defaultTradeBinderId } from "@/lib/binder/binder";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-27): "every cardflare account should have a base
 * trade binder on their account marked as trades, makes it dead simple
 * for people to understand and then when they make their trade binder,
 * that's where we will explain that."
 */
describe("the Trades binder every account has", () => {
  it("is the oldest binder up for trade, whatever its name", () => {
    expect(
      defaultTradeBinderId([
        { id: "pc", for_trade: false, created_at: "2026-01-01T00:00:00Z" },
        { id: "late", for_trade: true, created_at: "2026-06-01T00:00:00Z" },
        { id: "first", for_trade: true, created_at: "2026-03-01T00:00:00Z" },
      ]),
    ).toBe("first");
    expect(defaultTradeBinderId([])).toBeNull();
  });

  it("is made on the owner's first read, once, and never deleted or taken off trade", () => {
    const binder = read("src/lib/binder/binder.ts");
    expect(binder).toContain('export const DEFAULT_TRADE_BINDER_NAME = "Trades";');
    expect(binder).toContain(
      "const rows = yours ? await withTradeBinder(ownerId, read) : read;",
    );
    /* The same id every time, so two reads at once make one binder. */
    expect(binder).toContain("id: defaultTradeBinderUuid(ownerId),");
    expect(binder).toContain('error.code !== "23505"');
    expect(binder.match(/reason: "default-trade"/g)?.length).toBeGreaterThanOrEqual(2);
    /* Others do not see an empty one. */
    expect(binder).toContain("summary.count > 0 || !summary.forTrade");
  });

  it("explains itself where the cards go in, and has no Delete, on both platforms", () => {
    const line =
      "Cards you add here are matched with players near you who are hunting them.";
    expect(read("mobile/src/screens/binder.tsx")).toContain(line);
    expect(read("src/components/binder/binder-page.tsx")).toContain(line);
    expect(read("mobile/src/screens/binder.tsx")).toContain(
      "{binder.isDefault ? null : (",
    );
    expect(read("src/components/binder/binder-settings.tsx")).toContain(
      "{!isDefault && (",
    );
  });
});
