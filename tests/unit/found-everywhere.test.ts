import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cardCountLabel } from "@/lib/feed/card-copy";

/**
 * The founder: "it should just update with that green found thing and
 * gray out the card, whenever a card is removed in flares or adjusted
 * or whatever... keep the post up so it can remain social." Then:
 * "remove cards from flares and it's all global - updates everywhere
 * as found."
 *
 * One rule (src/lib/players/found.ts), four doors into it, and every
 * reader treating done as a count. These pins keep a door from being
 * added that forgets the rule, and a reader from drawing a done card
 * as wanted.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("found, everywhere", () => {
  it("every door that removes or adjusts a card calls the one rule", () => {
    const wants = read("src/lib/players/wants.ts");
    const removeWant = wants.slice(wants.indexOf("export async function removeWant"));
    expect(removeWant).toContain('await markCardFound(playerId, want.card_id, "want")');

    const lists = read("src/lib/lists/repository.ts");
    const cancel = lists.slice(
      lists.indexOf("export async function cancelFlare"),
      lists.indexOf(
        "export async function",
        lists.indexOf("export async function cancelFlare") + 1,
      ),
    );
    expect(cancel).toContain("await markCardFound(owner, flare.card_id, flare.intent)");
    expect(cancel).not.toContain('status: "cancelled"');
    const binder = lists.slice(lists.indexOf("export async function removeFromBinder"));
    expect(binder).toContain('await markCardFound(owner, entry.card_id, "showcase")');

    /* The copies wanted, changed on the Flare screen, both platforms' doors. */
    expect(read("src/lib/players/account-actions.ts")).toContain(
      'await syncCardQuantity(playerId, want.cardId, quantity, "want")',
    );
    expect(read("src/app/api/v1/wants/[id]/route.ts")).toContain(
      'await syncCardQuantity(player.playerId, want.cardId, quantity, "want")',
    );
  });

  it("the rule writes counts, never a status, and reaches every Flare and hunt", () => {
    const found = read("src/lib/players/found.ts");
    expect(found).toContain("found_quantity: flare.quantity");
    expect(found).toContain("quantity_found: request.quantity_needed");
    expect(found).not.toContain("status:");
    /* Area Flares and board Flares alike: by account, or by any of its sessions. */
    expect(found).toContain("player_id.eq.${playerId},player_session_id.in.(");
  });

  it("the Feed reads done as a count, on a want and on an offer", () => {
    const repo = read("src/lib/feed/repository.ts");
    const decorate = repo.slice(repo.indexOf("async function decorateHunts"));
    expect(decorate).toContain(
      'if ((card.remaining ?? 1) === 0) card.state = "found";',
    );
    expect(decorate).toContain("hunt.completed = hunt.remainingCopies === 0;");
    const posts = read("src/lib/feed/posts.ts");
    expect(posts).toContain("(remaining.get(flare.id) ?? 1) === 0");
  });

  it("a done card stops matching and stops being wanted from anybody", () => {
    expect(read("src/lib/nearby/matching.ts")).toContain(
      "if ((row.found_quantity ?? 0) >= row.quantity) continue;",
    );
    expect(read("src/lib/feed/repository.ts")).toContain(
      "(flare.found_quantity ?? 0) < flare.quantity",
    );
  });

  it("an offer's done card reads Gone, a want's reads Found", () => {
    const base = {
      cardId: "c",
      cardName: "Shanks",
      cardNumber: "ST16-004",
      imageUrl: null,
      match: null,
      quantity: 2,
    };
    expect(cardCountLabel({ ...base, remaining: 0 }, "showcase")).toBe("Gone");
    expect(cardCountLabel({ ...base, state: "found" }, "showcase")).toBe("Gone");
    expect(cardCountLabel({ ...base, remaining: 2 }, "showcase")).toBe("2 available");
    expect(cardCountLabel({ ...base, remaining: 0 }, "want")).toBe("Found");
    expect(cardCountLabel({ ...base, remaining: 1 }, "want")).toBe("Need 1 more");

    const app = read("mobile/src/flare-copy.ts");
    expect(app).toContain('export const GONE_LABEL = "Gone"');
    for (const path of [
      "mobile/src/flare-deck-pager.tsx",
      "mobile/src/flare-cards-sheet.tsx",
    ]) {
      expect(read(path)).toContain("GONE_LABEL");
    }
  });

  it("a done post says so once, on both platforms and in both views", () => {
    const sheet = read("src/components/feed/flare-cards-sheet.tsx");
    expect(sheet).toContain('"All gone"');
    expect(sheet).toContain('"All found"');
    /* And the tile's foot agrees with the words beside it. */
    expect(read("src/components/feed/feed-tile.tsx")).toContain(
      'state === "found" && direction === "showcase" ? "gone" : state',
    );
    expect(read("src/components/feed/flare-feed-card-compact.tsx")).toContain(
      'item.completed ? (offering ? "All gone" : "All found") : null',
    );
    expect(read("mobile/src/flare-feed-card-compact.tsx")).toContain("doneLabel(");
    expect(read("mobile/src/flare-feed-card.tsx")).toContain('doneLabel("showcase")');
  });

  it("a found card goes to the far right, on the Feed and on the post page", () => {
    /* "if a card is found, it gets moved to the far right so the most
       pertinent flares are always front and center." Decided on the
       server, so both platforms and both views agree. */
    expect(read("src/lib/feed/card-copy.ts")).toContain("export const foundLast");
    expect(read("src/lib/feed/repository.ts")).toContain("hunt.cards.sort(foundLast);");
    expect(read("src/lib/feed/posts.ts")).toContain("[...postCards].sort(foundLast)");
  });

  it("a found card is black and white with one word on it, no second tick", () => {
    /* "there's no need to also have this overlapping gray checkmark
       thing... the card needs to go full black and white." */
    expect(read("src/components/feed/feed-tile.tsx")).toContain(
      '"opacity-60 grayscale"',
    );
    expect(read("src/components/feed/flare-feed-card-compact.tsx")).toContain(
      "if (done) return null;",
    );
    expect(read("mobile/src/flare-feed-card-compact.tsx")).toContain(
      "if (done) return null;",
    );
    const foil = read("mobile/src/foil.tsx");
    expect(foil).toContain("function Greyed(");
    expect(foil).toContain("<ColorMatrix matrix={GREY} />");
    expect(read("mobile/src/ui.tsx")).toContain(
      'state === "found" ? getFoilKit() : null',
    );
  });

  it("a found card on a board greys out and loses its Remove", () => {
    const rows = read("src/components/lists/list-entries.tsx");
    expect(
      rows.match(/kind === "flare" && entry\.foundQuantity >= entry\.quantity/g)
        ?.length,
    ).toBe(2);
    expect(rows.match(/removable && !found &&/g)?.length).toBe(2);
  });
});
