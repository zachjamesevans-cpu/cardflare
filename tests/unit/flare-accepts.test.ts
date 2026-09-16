import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_DRAFT, parseDraft } from "@/components/flares/draft";

/**
 * A Flare is open to a trade, to cash, or to both, never to neither.
 * `flares_accepts_something` (20260826090000_flare_accepts.sql) refuses
 * the row, and the first offering posted from the website's composer
 * met it: the draft started with both off and nothing stopped it.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("a Flare is open to something", () => {
  it("a new draft starts open to a trade, like the app's", () => {
    expect(EMPTY_DRAFT.acceptsTrade).toBe(true);
  });

  it("a saved draft with neither is repaired on load", () => {
    const stored = JSON.stringify({
      intent: "showcase",
      cards: [],
      caption: "",
      hunt: { kind: "none" },
      acceptsTrade: false,
      acceptsCash: false,
    });
    const draft = parseDraft(stored);
    expect(draft?.acceptsTrade).toBe(true);
    expect(draft?.acceptsCash).toBe(false);
    const cashOnly = parseDraft(
      stored.replace('"acceptsCash":false', '"acceptsCash":true'),
    );
    expect(cashOnly?.acceptsTrade).toBe(false);
    expect(cashOnly?.acceptsCash).toBe(true);
  });

  it("the server defaults to a trade when a client sends neither", () => {
    const publish = read("src/lib/flares/publish.ts");
    expect(publish).toMatch(
      /acceptsTrade: input\.acceptsTrade \|\| !input\.acceptsCash/,
    );
    expect(publish).not.toMatch(/acceptsTrade: input\.acceptsTrade,/);
  });

  it("the composer never lets the last one be switched off", () => {
    const composer = read("src/components/flares/flare-composer.tsx");
    expect(composer).toMatch(/if \(!last\) patch\(\{ \[key\]: !draft\[key\] \}\)/);
    const app = read("mobile/src/screens/flare-composer.tsx");
    expect(app).toMatch(/disabled=\{draft\.acceptsTrade && !draft\.acceptsCash\}/);
    expect(app).toMatch(/disabled=\{draft\.acceptsCash && !draft\.acceptsTrade\}/);
  });
});
