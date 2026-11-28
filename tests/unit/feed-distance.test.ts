import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-27): "no need to have location in the main feed
 * section. that is for people you follow, dont really need to know how
 * close they are to you."
 */
describe("how far a post is", () => {
  it("shows on Nearby's posts only, on both platforms", () => {
    expect(read("mobile/src/flare-feed-card.tsx")).toContain(
      'item.tab === "nearby" && typeof item.milesAway === "number"',
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toMatch(
      /"tab" in item &&\s*item\.tab === "nearby" &&\s*typeof item\.milesAway === "number"/,
    );
  });
});

describe("Nearby leads with yours", () => {
  it("draws your open Flares and trade binders first, on both platforms", () => {
    const app = read("mobile/src/screens/home.tsx");
    expect(app).toContain("<NearbyYours");
    expect(app).toContain("binders.filter((binder) => binder.forTrade)");
    const web = read("src/app/nearby/page.tsx");
    expect(web).toContain("Players within ${miles ?? 50} mi see these.");
    expect(web).toContain("binders.filter((binder) => binder.forTrade)");
  });
});
