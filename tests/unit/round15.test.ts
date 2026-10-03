import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dedupeHunts } from "@/lib/feed/repository";
import { mergeFlareRows } from "@/lib/players/want-rows";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Round 15: the trust and data fixes from the second audit. One post
 * once, one number per thing, and a timeline that tells the whole
 * story.
 */

describe("the Feed shows a post once (audit B1)", () => {
  const hunt = (playerId: string, postId: string, code: string | null) => ({
    kind: "hunt",
    playerId,
    postId,
    code,
  });

  it("folds the two doors a room Flare comes in by, and keeps the room's copy", () => {
    const out = dedupeHunts([
      hunt("p1", "post-a", null),
      hunt("p1", "post-a", "ABC123"),
      hunt("p2", "post-a", null),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.code).toBe("ABC123");
    expect(out[1]?.playerId).toBe("p2");
  });

  it("leaves everything that is not a hunt alone", () => {
    const out = dedupeHunts([
      { kind: "storePost", playerId: null, postId: "x", code: null },
      { kind: "storePost", playerId: null, postId: "x", code: null },
    ]);
    expect(out).toHaveLength(2);
  });

  it("is applied before the posts are sorted", () => {
    const source = read("src/lib/feed/repository.ts");
    expect(source).toMatch(/byPostedAt<HuntItem \| StorePostItem>\(\s*dedupeHunts\(\[/);
  });
});

describe("one Flares number (audit B4, counts)", () => {
  it("the profile's number is wants plus offerings, the same as its grid", () => {
    const stats = read("src/lib/players/stats.ts");
    expect(stats).toContain("countOfferings(playerId)");
    expect(stats).toContain("flares: (wants.count ?? 0) + offerings");
    const wants = read("src/lib/players/wants.ts");
    expect(wants).toContain("export async function countOfferings(");
    expect(wants).toContain("return describeRows(await offeringRows(playerId));");
  });

  it("admin shows the same number, and names the all-time row count apart", () => {
    const timeline = read("src/lib/admin/player-timeline.ts");
    expect(timeline).toContain("flares: openFlares.flares,");
    expect(timeline).toContain("flareRows: flares.count ?? 0,");
    const activity = read("src/components/admin/player-activity.tsx");
    expect(activity).toContain('["Flares", counts.flares]');
    expect(activity).toContain('["Flare rows, all time", counts.flareRows]');
  });
});

describe("one Embers definition (audit B4, Embers)", () => {
  it("admin counts trading on its own and names the rest", () => {
    const report = read("src/lib/admin/embers-report.ts");
    expect(report).toContain("earnedOther: number;");
    expect(report).toContain('row.earned_delta > 0 && row.reason !== "trade"');
    const page = read("src/app/admin/reports/page.tsx");
    expect(page).toContain('label="Embers earned by trading"');
    expect(page).toContain('label="Embers from attendance and grants"');
  });

  it("the badge no longer claims trading alone, on both platforms", () => {
    for (const path of ["src/app/profile/page.tsx", "mobile/src/screens/profile.tsx"]) {
      const source = read(path);
      expect(source, path).toContain("Earned, all time");
      expect(source, path).not.toContain("Earned by trading, all time");
      expect(source, path).not.toContain("Trades are the only thing");
      expect(source, path).toMatch(/turning up at your\s+stores\s+and grants/);
    }
    /* The trades page's number is trading only, and says so. */
    expect(read("src/lib/trades/history.ts")).toContain(
      '.in("reason", ["trade", "reversal"])',
    );
  });
});

describe("the admin timeline tells the whole story (audit B7)", () => {
  const timeline = read("src/lib/admin/player-timeline.ts");

  it("reads offers, logged trades, take-downs and found updates", () => {
    expect(timeline).toContain('.from("flare_responses")');
    expect(timeline).toContain('.from("logged_trades")');
    expect(timeline).toContain("Took down ${name}");
    expect(timeline).toContain("Found ${row.found_quantity} of ${name}");
    expect(timeline).toContain('kind: "offer" as const');
    expect(timeline).toContain('kind: "logged" as const');
    expect(timeline).toContain("found_quantity");
    expect(timeline).toContain("updated_at");
  });

  it("takes Last in a room from a seat, not a session", () => {
    expect(timeline).toContain('.from("event_participants")');
    expect(timeline).toContain(
      "const lastActiveAt = seats.data?.[0]?.last_seen_at ?? null;",
    );
    expect(timeline).not.toMatch(/\.map\(\(row\) => row\.last_seen_at\)\s*\.sort\(\)/);
  });

  it("draws the two new kinds", () => {
    const activity = read("src/components/admin/player-activity.tsx");
    expect(activity).toContain("offer: Handshake");
    expect(activity).toContain("logged: Handshake");
  });
});

describe("the Flare tab folds identical rows (audit rough edge)", () => {
  it("sums copies of the same card, printing and direction, and keeps the first row's id", () => {
    const out = mergeFlareRows([
      { id: "a", cardId: "c1", printingLabel: "OP-05", quantity: 1, direction: "want" },
      { id: "b", cardId: "c1", printingLabel: "OP-05", quantity: 2, direction: "want" },
      {
        id: "c",
        cardId: "c1",
        printingLabel: "OP-05",
        quantity: 1,
        direction: "offering",
      },
      { id: "d", cardId: "c1", printingLabel: null, quantity: 1, direction: "want" },
    ]);
    expect(out.map((row) => row.id)).toEqual(["a", "c", "d"]);
    expect(out[0]?.quantity).toBe(3);
  });

  it("is what the Flare tab draws", () => {
    expect(read("src/app/flare/page.tsx")).toContain("mergeFlareRows(");
  });
});
