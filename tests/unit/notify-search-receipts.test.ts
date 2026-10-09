import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { postHref, truncatePreview } from "@/lib/notifications/preview";
import { matchScore as webScore } from "@/lib/search/rank";
import { matchScore as appScore } from "../../mobile/src/search-rank";

const read = (path: string) => readFileSync(path, "utf8");

describe("a notice's preview line", () => {
  it("leaves a short body alone", () => {
    expect(truncatePreview("hello")).toBe("hello");
  });

  it("never cuts an emoji in half", () => {
    /* 119 letters then an emoji straddling the old UTF-16 cut. */
    const body = `${"a".repeat(118)}🔥🔥🔥`;
    const cut = truncatePreview(body);
    expect(cut).toBe(`${"a".repeat(118)}🔥…`);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(Array.from(cut)).toHaveLength(120);
  });

  it("is what notify.ts uses for every preview", () => {
    const notify = read("src/lib/notifications/notify.ts");
    expect(notify).not.toMatch(/\.slice\(0, 119\)/);
    expect(notify).toContain("truncatePreview(body)");
  });
});

describe("a comment notice", () => {
  it("opens the post, on both platforms", () => {
    expect(postHref("abc")).toBe("/feed?post=abc");
    const notify = read("src/lib/notifications/notify.ts");
    const comment = notify.slice(
      notify.indexOf("export async function notifyPostComment"),
    );
    expect(comment.slice(0, 1200)).toContain("const path = postHref(postId);");

    const follow = read("mobile/src/follow-href.ts");
    expect(follow).toContain('const postId = queryValue(href, "post");');
    expect(follow).toContain('navigation.navigate("FlarePost", { postId });');
  });
});

describe("search", () => {
  it("folds accents but keeps every script's letters", () => {
    for (const score of [webScore, appScore]) {
      expect(score("pokemon", ["Pokémon"])).toBe(4);
      expect(score("ルフィ", ["ルフィ"])).toBe(4);
      expect(score("лу", ["Луффи"])).toBe(3);
      expect(score("김", ["김철수"])).toBe(3);
    }
  });

  it("asks for exact and starts-with matches on their own, before the limit", () => {
    const search = read("src/lib/players/search.ts");
    expect(search).toContain("mergeBestFirst(");
    expect(search).toContain("quoteFilterValue(`${escaped}%`)");
    expect(search).toContain("rankBy(");
  });

  it("keeps the last answer up while the next one loads", () => {
    const screen = read("mobile/src/screens/search.tsx");
    const searchFor = screen.slice(
      screen.indexOf("const searchFor = "),
      screen.indexOf("const type = "),
    );
    expect(searchFor).toContain("current?.request === request");
    /* Clearing happens only when the box is too short to search. */
    expect(searchFor.match(/setFound\(null\)/g)).toHaveLength(1);
  });
});

describe("push receipts", () => {
  it("run daily (the Hobby plan's limit) and page through what is pending", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/push-receipts",
      schedule: "0 12 * * *",
    });
    const route = read("src/app/api/cron/push-receipts/route.ts");
    expect(route).toContain("while (batches < MAX_BATCHES");
    expect(route).toContain("if (batch.read < BATCH) break;");
  });
});

describe("notices after the response", () => {
  it("are kept alive with after(), not launched with void", () => {
    for (const file of [
      "src/app/api/players/[playerId]/route.ts",
      "src/app/api/v1/rooms/[code]/flares/route.ts",
      "src/lib/players/account-actions.ts",
      "src/lib/events/auto-post.ts",
      "src/lib/events/follow-on.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/\bvoid notify/);
      expect(source, file).toContain("afterResponse(");
    }
  });
});
