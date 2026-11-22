import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { foldForFilter, isObjectionable } from "@/lib/moderation/objectionable";

/**
 * App Store Guideline 1.2: a filter in front of what players post, beside
 * Report and Block. Narrow on purpose: it must never stop trade talk.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the filter", () => {
  it("refuses slurs and explicit words, however they are dressed up", () => {
    for (const text of [
      "you f4g",
      "N1GG3R",
      "xx_niggerslayer_xx",
      "what a retard",
      "send nudes",
      "Wh0re",
      "cuuunt",
      "n.i.g.g.e.r",
    ]) {
      expect(isObjectionable(text), text).toBe(true);
    }
  });

  it("lets every ordinary card-game and trading word through", () => {
    for (const text of [
      "Spicy deck, trading my Shanks",
      "Cockatrice for your Raccoon",
      "Grapes, scrapes, drapes",
      "Kill it, destroy it, trash it, attack!",
      "Monkey.D.Luffy x3, Trafalgar Law",
      "Assassin's Creed, Classic, Passage",
      "Scunthorpe store night",
      "Therapist, Shitake? no: Shiitake mushroom",
      "Cucumber, document, circumference",
      "Hancock, Peacock, Shuttlecock",
      "Dickens, Moby Dick",
      "Coonhound promo",
      "Kakashi, Nami, Kuina, Koby",
      "@zach 1v1 at 7pm",
    ]) {
      expect(isObjectionable(text), text).toBe(false);
    }
    expect(isObjectionable(null)).toBe(false);
    expect(isObjectionable("")).toBe(false);
  });

  it("folds look-alikes and long runs", () => {
    expect(foldForFilter("H3LL0 $@M!")).toBe("hello sami");
    expect(foldForFilter("noooooo")).toBe("no");
  });
});

describe("where it stands", () => {
  it("guards every message and comment at the one place each is written", () => {
    expect(read("src/lib/local/threads.ts")).toContain(
      "if (isObjectionable(body)) return false;",
    );
    expect(read("src/lib/feed/posts.ts")).toContain(
      "if (isObjectionable(clean)) return null;",
    );
  });

  it("guards names, handles and bios, with a message the player reads", () => {
    for (const file of [
      "src/lib/players/schema.ts",
      "src/lib/players/profile-schema.ts",
      "src/lib/players/handle-schema.ts",
      "src/lib/binder/actions.ts",
      "src/app/api/v1/binders/_shared.ts",
    ]) {
      expect(read(file), file).toContain("OBJECTIONABLE_MESSAGE");
    }
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain('if (isObjectionable(name)) return "failed";');
    expect(profile).toContain('if (isObjectionable(handle)) return "failed";');
  });

  it("guards a Flare's caption, card notes and a new hunt's name", () => {
    expect(read("src/lib/flares/publish.ts")).toContain(
      'return { ok: false, reason: "objectionable" };',
    );
    expect(read("src/app/api/v1/flares/publish/route.ts")).toContain(
      'error: "objectionable"',
    );
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      'code === "objectionable"',
    );
  });
});
