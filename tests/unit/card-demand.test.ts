import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { demandLine } from "@/lib/cards/demand-copy";
import { demandLine as appLine } from "../../mobile/src/demand-copy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a card's standing, in one line", () => {
  it("says nothing when nobody is on either side", () => {
    expect(demandLine({ hunters: 0, holders: 0 })).toBeNull();
    expect(demandLine(null)).toBeNull();
    expect(demandLine(undefined)).toBeNull();
  });

  it("counts both sides", () => {
    expect(demandLine({ hunters: 12, holders: 3 })).toBe(
      "12 hunting · 3 have it for trade",
    );
  });

  it("says one side alone when that is all there is", () => {
    expect(demandLine({ hunters: 4, holders: 0 })).toBe("4 hunting");
    expect(demandLine({ hunters: 0, holders: 1 })).toBe("1 has it for trade");
  });

  it("never carries a price", () => {
    for (const hunters of [0, 1, 12, 400]) {
      for (const holders of [0, 1, 3, 200]) {
        expect(demandLine({ hunters, holders }) ?? "").not.toMatch(/[$€£¥]/);
      }
    }
  });

  it("reads the same in the app", () => {
    for (const hunters of [0, 1, 12]) {
      for (const holders of [0, 1, 3]) {
        expect(appLine({ hunters, holders })).toBe(demandLine({ hunters, holders }));
      }
    }
    /* An older server sends no counts at all. */
    expect(appLine(undefined)).toBeNull();
  });

  it("is counted before the lists are cut to what a page shows", () => {
    const server = read("src/lib/cards/card-page.ts");
    expect(server).toContain(
      "demand: { hunters: everyHunter.length, holders: everyHolder.length },",
    );
    expect(server).toMatch(/const holders = everyHolder\s*\.slice\(0, HOLDERS_SHOWN\)/);
    expect(server).toMatch(/const hunters = everyHunter\s*\.slice\(0, HUNTERS_SHOWN\)/);
  });

  it("is drawn on the app's card screen, from a field an older server may not send", () => {
    expect(read("mobile/src/screens/card.tsx")).toContain("demandLine(page.demand)");
    expect(read("mobile/src/api.ts")).toContain(
      "demand?: { hunters: number; holders: number };",
    );
  });

  it("is drawn on the website's card page", () => {
    expect(read("src/components/cards/card-page.tsx")).toContain(
      "demandLine(page.demand)",
    );
  });
});
