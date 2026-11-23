import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PRO_ENABLED as WEB } from "@/lib/billing/pro-enabled";
import { FREE_AT_LAUNCH, tierAllows } from "@/lib/tiers";
import { huntLimitFor } from "@/lib/players/hunts";
import { PRO_ENABLED as APP } from "../../mobile/src/pro-enabled";

/**
 * Pro and the Embers shop are off for the App Store launch, on both
 * platforms, by one constant each (the founder, 2026-11-22). With no way
 * to buy Pro, a free player must not hit a Pro wall: those limits are
 * lifted for everyone. Cosmetics and whole-page scans stay Pro.
 */
describe("the Pro switch", () => {
  it("is the same on the website and in the app, and off", () => {
    expect(APP).toBe(WEB);
    expect(WEB).toBe(false);
  });

  it("lifts the walls a free player could not get past", () => {
    expect(Object.keys(FREE_AT_LAUNCH).sort()).toEqual([
      "animatedAvatar",
      "moreHunts",
      "tradeHistory",
      "wholeListOnWall",
    ]);
    for (const tier of ["free", null, "nonsense"]) {
      expect(tierAllows(tier, "tradeHistory")).toBe(true);
      expect(tierAllows(tier, "moreHunts")).toBe(true);
      expect(tierAllows(tier, "animatedAvatar")).toBe(true);
      expect(tierAllows(tier, "wholeListOnWall")).toBe(true);
    }
    expect(huntLimitFor("free")).toBe(huntLimitFor("pro"));
  });

  it("keeps cosmetics and whole-page scans for Pro", () => {
    expect(tierAllows("free", "cosmetics")).toBe(false);
    expect(tierAllows("free", "cardScanner")).toBe(false);
    expect(tierAllows("pro", "cosmetics")).toBe(true);
  });

  it("hides every door to the shop and Pro, on both platforms", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    /* The shop icon on your profile. */
    expect(read("mobile/src/screens/profile.tsx")).toMatch(
      /\{PRO_ENABLED \? \(\s*<HeaderButton\s*icon="storefront-outline"/,
    );
    expect(read("src/app/profile/page.tsx")).toMatch(
      /\{PRO_ENABLED \? \(\s*<Link\s*href="\/profile\/store"/,
    );
    /* The Feed's pack and shop cards, for both, from the server. */
    expect(read("src/lib/feed/repository.ts")).toContain(
      "PRO_ENABLED ? packItem(balance) : Promise.resolve([] as PackItem[])",
    );
    /* Settings' Pro card. */
    expect(read("mobile/src/screens/settings.tsx")).toContain(
      "{PRO_ENABLED ? <ProCard /> : null}",
    );
    expect(read("src/app/profile/settings/settings-content.tsx")).toMatch(
      /const proCard =\s*PRO_ENABLED && playerId \? \(/,
    );
    /* The shop page, and /pro for anybody not already on it. */
    expect(read("src/app/profile/store/page.tsx")).toContain(
      'if (!PRO_ENABLED) redirect("/profile");',
    );
    expect(read("src/app/pro/page.tsx")).toContain(
      'if (!PRO_ENABLED && (!plan || plan.state === "none")) redirect("/");',
    );
    /* Edit profile is the Profile tab alone. */
    expect(read("mobile/src/screens/edit-profile.tsx")).toContain(
      'const tab: EditTab = PRO_ENABLED ? chosenTab : "profile";',
    );
  });
});
