import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("tapping the tab you are on resets it", () => {
  it("each tab says what its reset is", () => {
    expect(read("mobile/src/tab-reset.ts")).toContain('addListener?.("tabPress"');
    for (const screen of ["home", "local", "search-lab", "profile"]) {
      expect(read(`mobile/src/screens/${screen}.tsx`), screen).toContain(
        "useTabReset(",
      );
    }
    const search = read("mobile/src/screens/search-lab.tsx");
    expect(search).toMatch(
      /useTabReset\(\(\) => \{\s*setQuery\(""\);\s*setGame\(null\);/,
    );
  });
});

describe("a search result tile", () => {
  const search = read("mobile/src/screens/search-lab.tsx");
  it("counts printings on the art; no Flare button or Hunt it on a result", () => {
    expect(search).toContain("accessibilityLabel={`${count} printings`}");
    /* No Flare button on each result: the founder, "not a fan". */
    expect(search).not.toContain("accessibilityLabel={`Flare ${hit.name}`}");
    expect(search).not.toMatch(/>\s*Hunt it\s*</);
    expect(search).not.toContain("printingsLine");
  });
});
