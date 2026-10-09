import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { wearingNeedsPro } from "@/lib/players/cosmetics";
import { wornFrame } from "@/lib/players/worn-frame";

/**
 * The older equip slots (avatar frame, card frame, holo, effect) wear
 * by the same rule as the catalogue: wearing is Pro. The founder's
 * pricing pivot - the free tier customizes nothing but the profile
 * picture. setEquip gated the catalogue; equipCosmetic did not, so a
 * free player could still put on anything they had once bought.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("what needs Pro to wear", () => {
  it("everything but the live free item of a kind", () => {
    expect(wearingNeedsPro({ cost_embers: 0, status: "live" })).toBe(false);
    expect(wearingNeedsPro({ cost_embers: 150, status: "live" })).toBe(true);
    /* Drafts cost nothing on paper and are still not anybody's default. */
    expect(wearingNeedsPro({ cost_embers: 0, status: "draft" })).toBe(true);
  });
});

describe("the doors that put something on", () => {
  const cosmetics = read("src/lib/players/cosmetics.ts");

  it("equipCosmetic checks the tier after ownership", () => {
    const body = cosmetics.slice(
      cosmetics.indexOf("export async function equipCosmetic"),
    );
    expect(body.slice(0, body.indexOf("slotUpdate("))).toContain(
      "wearingNeedsPro(item) && !(await tierMayWear(playerId))",
    );
  });

  it("buyCosmetic refuses before the Embers move, not after", () => {
    const body = cosmetics.slice(
      cosmetics.indexOf("export async function buyCosmetic"),
    );
    const gate = body.indexOf('reason: "not-pro"');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf("spendEmbers("));
  });

  it("a showcase card is dressed by the same rule", () => {
    const profile = read("src/lib/players/profile.ts");
    const body = profile.slice(profile.indexOf("async function wearableOrNull"));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("tierMayWear(playerId)");
  });

  it("both clients say why", () => {
    expect(read("src/lib/players/profile-schema.ts")).toContain(
      '"not-pro": "Wearing cosmetics is a cardflare Pro feature."',
    );
    expect(read("mobile/src/screens/store.tsx")).toContain(
      '"Wearing cosmetics is a cardflare Pro feature."',
    );
  });
});

describe("what a profile shows", () => {
  it("draws a non-Pro's frame as the free one", () => {
    expect(wornFrame({ tier: "free", equipped_avatar_frame: "prism" })).toBeNull();
    expect(wornFrame({ tier: null, equipped_avatar_frame: "prism" })).toBeNull();
    expect(wornFrame({ tier: "pro", equipped_avatar_frame: "prism" })).toBe("prism");
  });

  it("the profile read takes the old slots off a non-Pro", () => {
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain('const dresses = tierAllows(player.tier, "cosmetics");');
    expect(profile).toContain(
      ": { avatarFrame: null, frame: null, holo: null, effect: null },",
    );
    expect(profile).toContain(
      "showcase.map((entry) => ({ ...entry, frame: null, holo: null }))",
    );
  });

  it("every list that draws a face reads the frame through wornFrame", () => {
    for (const file of [
      "src/lib/players/search.ts",
      "src/lib/players/follows.ts",
      "src/lib/nearby/matching.ts",
      "src/lib/feed/posts.ts",
      "src/lib/feed/repository.ts",
      "src/lib/notifications/inbox.ts",
      "src/lib/players/profile.ts",
    ]) {
      const source = read(file);
      expect(source, file).toContain("wornFrame(");
      expect(source, file).not.toMatch(/frame: \w+\.equipped_avatar_frame/);
    }
  });
});
