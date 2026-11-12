import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ahead } from "@/lib/ahead";

/**
 * `ahead` lets a page start a read before the decision that used to
 * come first, and wait for it afterwards. Two things have to hold: the
 * answer is untouched, failure included, and a failure nobody waits
 * for does not surface as an unhandled rejection.
 */

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/** Long enough for Node to report a rejection nobody handled. */
const settle = () => new Promise((done) => setTimeout(done, 20));

describe("ahead", () => {
  it("hands back the very read it was given", async () => {
    const read = Promise.resolve(7);
    expect(ahead(read)).toBe(read);
    expect(await ahead(read)).toBe(7);
  });

  it("still throws to whoever waits for it", async () => {
    const read = ahead(Promise.reject(new Error("down")));
    await expect(read).rejects.toThrow("down");
  });

  it("lets a failure nobody asked about pass quietly", async () => {
    ahead(Promise.reject(new Error("never awaited")));
    await settle();
    expect(unhandled).toEqual([]);
  });
});
