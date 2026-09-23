import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The Flare tab's list, after the founder posted from the Feed and
 * found nothing there: "This section needs to update the second a
 * flare gets posted." And on the one row that said "Live in the Feed":
 * "they're all technically live on the feed... Delete that entirely."
 */
describe("the Flares list", () => {
  it("gets every want post, whether it went to a board or the Feed", () => {
    const publish = read("src/lib/flares/publish.ts");
    expect(publish).toContain('if (input.intent === "want") {');
    expect(publish).not.toContain('input.intent === "want" && input.eventId');
  });

  it("names only boards at shops, never the Feed, on both platforms", () => {
    const wants = read("src/lib/players/wants.ts");
    expect(wants).not.toContain("AREA_LABEL");
    expect(wants).not.toContain("name: AREA_LABEL");

    const web = read("src/components/players/want-entries.tsx");
    expect(web).not.toContain('"Saved"');
    expect(web).toContain("want.postedWhere && want.postedWhere.length > 0 &&");

    const app = read("mobile/src/want-row.tsx");
    expect(app).not.toContain(">Saved<");
    expect(app).not.toContain("Live at ${want.postedAt}");
  });

  it("keeps the composer's last-on chip lit rather than dimmed", () => {
    const pill = read("mobile/src/flare-bits.tsx");
    expect(pill).toContain("opacity: disabled && !active ? 0.5 : 1,");
    expect(pill).toContain(
      "color: active ? colors.textPrimary : colors.textSecondary,",
    );
  });
});

describe("offerings on the same list", () => {
  it("lists a player's open offering posts beside their wants, on both platforms", () => {
    const wants = read("src/lib/players/wants.ts");
    expect(wants).toContain("export async function listOfferings(");
    expect(wants).toContain('.eq("intent", "showcase")');
    expect(wants).toContain('direction?: "want" | "offering";');

    expect(read("src/app/flare/page.tsx")).toContain("listOfferings(playerId),");
    expect(read("src/app/api/v1/me/route.ts")).toContain(
      "listOfferings(player.playerId),",
    );
    expect(read("mobile/src/screens/hub.tsx")).toContain(
      'want.direction === "offering"',
    );
  });

  it("acts on every open post of the card, on both platforms", () => {
    const actions = read("src/lib/players/account-actions.ts");
    expect(actions).toContain('await markCardFound(playerId, cardId, "showcase");');
    expect(actions).toContain("row.quantity + Math.trunc(delta),");
    expect(actions).toMatch(/Math\.trunc\(delta\),\s*"showcase",\s*\);/);
    const api = read("src/app/api/v1/offerings/route.ts");
    expect(api).toContain(
      'await markCardFound(player.playerId, body.cardId, "showcase");',
    );
    expect(read("mobile/src/api.ts")).toContain('"/api/v1/offerings"');
  });

  it("shows what was posted the instant the post lands in the app", () => {
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "id: `just-posted:${keyOf(item)}`",
    );
    expect(read("mobile/src/screens/hub.tsx")).toContain(
      "setWants((current) => [...rows, ...(current ?? [])]);",
    );
  });
});

describe("the Feed's green ring", () => {
  it("never marks the viewer's own post", () => {
    const repo = read("src/lib/feed/repository.ts");
    expect(repo).toContain("item.cards.map((card) => ({ ...card, match: null }))");
  });

  it("has room for its glow in the website's carousel", () => {
    expect(read("src/components/feed/flare-carousel.tsx")).toContain(
      "-mx-3 -my-2.5 flex",
    );
    expect(read("src/components/feed/flare-carousel.tsx")).toContain("px-3 py-3");
  });
});
