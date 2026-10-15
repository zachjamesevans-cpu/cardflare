import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Taking a card down takes it off the list a room re-posts from.
 *
 * The founder, after joining Mox Valley: "it's clear that the app is
 * saving old flares somewhere and reposting them even though i deleted
 * / found the cards already and removed them." Posting a want saves it;
 * Take down and removing a card from a hunt left the saved want behind,
 * so the next room joined put it back up.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("a card taken down stays down", () => {
  it("clears the want when a Flare is taken down, unless it is still up elsewhere", () => {
    const withdraw = read("src/lib/flares/withdraw.ts");
    expect(withdraw).toContain("await forgetWants(playerId, owned, rows ?? []);");
    const forget = withdraw.slice(withdraw.indexOf("async function forgetWants("));
    expect(forget).toContain('row.intent === "want"');
    expect(forget).toContain('.eq("status", "open")');
    expect(forget).toContain("clearWant(playerId, row.card_id, row.printing_id)");
  });

  it("saves the want again on undo", () => {
    const withdraw = read("src/lib/flares/withdraw.ts");
    const restore = withdraw.slice(
      withdraw.indexOf("export async function restoreFlares("),
    );
    expect(restore).toContain("saveWant(playerId, {");
  });

  it("clears the want when a card leaves a hunt, unless still asked for", () => {
    const hunts = read("src/lib/players/hunts.ts");
    expect(hunts).toContain(
      "else await forgetWantIfDone(playerId, request.card_id, request.printing_id);",
    );
    const forget = hunts.slice(hunts.indexOf("async function forgetWantIfDone("));
    expect(forget).toContain('.from("hunt_requests")');
    expect(forget).toContain("await clearWant(playerId, cardId, printingId);");
  });

  it("leaves a room's own take-down alone: the card is still wanted elsewhere", () => {
    const withdraw = read("src/lib/flares/withdraw.ts");
    const room = withdraw.slice(
      withdraw.indexOf("export async function withdrawRoomFlare("),
      withdraw.indexOf("export async function restoreFlares("),
    );
    expect(room).not.toContain("forgetWants");
  });
});
