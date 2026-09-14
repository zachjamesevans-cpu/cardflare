import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  haveThisMessage,
  messageOpener,
  milesLabel,
} from "../../src/lib/nearby/shared";
import { meetLine, suggestText } from "../../src/lib/nearby/meet";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Nearby matching's words, and the two files the app copies them from.
 *
 * The distance label is the privacy promise in one function: a match
 * says roughly how far, never exactly, and never closer than two miles.
 */
describe("the distance label", () => {
  it("never says closer than two miles", () => {
    expect(milesLabel(0)).toBe("Under 2 mi away");
    expect(milesLabel(1.9)).toBe("Under 2 mi away");
  });

  it("rounds to whole miles", () => {
    expect(milesLabel(2.8)).toBe("About 3 mi away");
    expect(milesLabel(11.2)).toBe("About 11 mi away");
  });
});

describe("the first message", () => {
  it("names the store when there is one", () => {
    expect(haveThisMessage("Grand Line Games")).toContain("Grand Line Games");
    expect(haveThisMessage(null)).toBe("I have this one. Where do you usually play?");
    expect(messageOpener()).toMatch(/^Hi/);
  });

  it("suggests a store, never an address", () => {
    const meet = {
      storeName: "Grand Line Games",
      nextEventName: "Friday locals",
      nextEventAt: "2026-09-18T01:00:00.000Z",
      timeZone: "America/Los_Angeles",
      shared: true,
    };
    expect(meetLine(meet)).toMatch(/^You both go to Grand Line Games\./);
    expect(suggestText("", meet)).toMatch(/^Want to meet at Grand Line Games on /);
    expect(suggestText("Sure.", meet)).toMatch(/^Sure\. Want to meet at/);
    expect(meetLine({ ...meet, nextEventAt: null, shared: false })).toBe(
      "You go to Grand Line Games. Walk in any time.",
    );
  });
});

describe("the app's copies", () => {
  it("keep the words the website uses", () => {
    /* The app cannot import from src/, so it carries a copy of each
       small module. Twins, checked here, so a wording change on one
       platform cannot ship without the other. */
    const strip = (source: string) => source.replace(/\/\*\*[\s\S]*?\*\//g, "").trim();
    expect(strip(read("mobile/src/nearby-shared.ts"))).toBe(
      strip(read("src/lib/nearby/shared.ts")),
    );
    expect(strip(read("mobile/src/meet.ts"))).toBe(
      strip(read("src/lib/nearby/meet.ts")),
    );
  });
});
