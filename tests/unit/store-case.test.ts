import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CASE_SIZE, normalizeCasePicks } from "@/lib/stores/case-schema";

/**
 * "In the case this week": six cards from the store's synced singles,
 * chosen by hand, on the store's page on both platforms.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("the case", () => {
  it("holds six, deduped, blanks dropped", () => {
    expect(CASE_SIZE).toBe(6);
    expect(normalizeCasePicks(["a", " a ", "", "b", "c", "d", "e", "f", "g"])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("only a stocked card goes in, whoever asks", () => {
    const repo = read("src/lib/stores/case.ts");
    expect(repo).toContain('from("store_singles")');
    expect(repo).toContain('reason: "not-stocked"');
    const actions = read("src/lib/stores/case-actions.ts");
    expect(actions).toContain("authorizedCurator");
    expect(actions).toMatch(/organizerStoreIds/);
    expect(actions).toMatch(/storeRoles/);
  });

  it("has a Case tab for owners and organizers", () => {
    const tabs = read("src/components/stores/store-tabs.tsx");
    expect(tabs).toMatch(/OWNER_TABS[\s\S]*"case"/);
    expect(tabs).toMatch(/ORGANIZER_TABS: StoreTabId\[\] = \[[^\]]*"case"/);
    expect(read("src/components/stores/store-tabs-nav.tsx")).toContain(
      'href: "/store/case"',
    );
  });

  it("is drawn with the same title on both platforms", () => {
    expect(read("src/app/s/[storeId]/page.tsx")).toContain("In the case this week");
    expect(read("mobile/src/screens/store-profile.tsx")).toContain(
      "In the case this week",
    );
    expect(read("src/lib/stores/public-profile.ts")).toContain(
      "casePicks: await caseFor(storeId)",
    );
    expect(read("mobile/src/api.ts")).toContain("casePicks?:");
  });
});
