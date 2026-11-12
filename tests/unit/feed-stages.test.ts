import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Feed is the first screen of both clients, and it used to make its
 * reads one after another: about fifteen stops before anything drew.
 * It is four stages now, each a Promise.all. This reads the function
 * and fails if somebody adds a sixteenth stop to the top level again.
 */
const repo = readFileSync(join(process.cwd(), "src/lib/feed/repository.ts"), "utf8");

function listFeedBody(): string {
  const start = repo.indexOf("export async function listFeed(");
  const end = repo.indexOf("/** Posts in a guest's sample", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return repo.slice(start, end);
}

describe("the Feed's reads run in stages, not in a line", () => {
  /* Top-level awaits only: the function's own indentation is two spaces. */
  const stops = listFeedBody()
    .split("\n")
    .filter((line) => /^ {2}(?=\S).*\bawait\b/.test(line));

  it("waits four times at the top level", () => {
    expect(stops).toHaveLength(4);
  });

  it("makes three of those waits a batch of reads", () => {
    expect(stops.filter((line) => line.includes("await Promise.all(["))).toHaveLength(
      3,
    );
    expect(stops[3]).toContain("await decorateHunts(items, playerId, origin);");
  });

  it("starts everything that needs only the viewer together", () => {
    const body = listFeedBody();
    const stageOne = body.slice(0, body.indexOf("const wanted = new Set("));
    for (const read of [
      "listLocals(playerId)",
      "listFollowing(playerId)",
      "listWants(playerId)",
      "viewerAsAuthor(playerId)",
      "originForPlayer(playerId, device)",
      "feedRadiusFor(playerId)",
      "blockedSet(playerId)",
      "storePostItems(playerId, sessionId)",
    ]) {
      expect(stageOne).toContain(read);
    }
  });

  it("still keeps a failed suggestion from taking the Feed down", () => {
    expect(listFeedBody()).toMatch(
      /popularAuthorsFor\(playerId, new Set\(followed\.keys\(\)\)\)\s*\.catch\(/,
    );
  });
});
