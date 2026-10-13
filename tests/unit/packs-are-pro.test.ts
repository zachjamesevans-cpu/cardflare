import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Packs are Pro, like buying and wearing a cosmetic.
 *
 * The Embers review found a free player could spend 300 Embers on a pack
 * of cosmetics they could not wear. The founder chose "option b": keep
 * wearing Pro and stop the spend - refused before an Ember moves, with
 * the door to Pro shown instead of Buy.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("buying a pack", () => {
  it("is refused for a free player before any Embers move", () => {
    const repository = read("src/lib/packs/repository.ts");
    const buy = repository.slice(
      repository.indexOf("export async function buyPackWithEmbers("),
    );
    const gate = buy.indexOf('if (!(await tierMayWear(playerId))) return "not-pro";');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(buy.indexOf("spendEmbers("));
  });

  it("answers the refusal plainly, and both shops show the door to Pro", () => {
    expect(read("src/app/api/v1/packs/route.ts")).toContain(
      'return Response.json({ error: "not-pro" }, { status: 403 });',
    );
    expect(read("src/components/packs/pack-shop.tsx")).toContain(
      "Packs are Pro · See Pro",
    );
    expect(read("src/app/profile/store/page.tsx")).toContain("pro={canWear}");
    expect(read("mobile/src/pack-shop.tsx")).toContain(
      '<Button label="Packs are Pro" onPress={onPro} />',
    );
    expect(read("mobile/src/screens/store.tsx")).toContain(
      'onPro={() => navigation.navigate("Pro")}',
    );
  });

  it("does not tell a free player they can unlock cosmetics", () => {
    const pro = read("src/app/pro/page.tsx");
    expect(pro).not.toContain("You can browse and unlock cosmetics with Embers too");
    expect(pro).not.toContain("bought in the shop by anyone");
  });
});
