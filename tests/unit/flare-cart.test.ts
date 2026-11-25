import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-25): "when pressing the + button, it just has ...
 * similar function to how when you add something to cart, it just
 * tallies up, then you can view 'full cart' ... this would prevent a pop
 * up screen from sliding up for every card added."
 */
describe("the Flare as a cart", () => {
  it("is the composer's own draft, on both platforms", () => {
    const app = read("mobile/src/flare-cart.ts");
    expect(app).toContain('readCache<SavedDraft>("composer"');
    expect(app).toContain('writeCache("composer", key, next)');
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "cartSaved(draft.items);",
    );
    const web = read("src/components/flares/flare-cart.ts");
    expect(web).toMatch(
      /saveDraft\(\{\s*\.\.\.draft,\s*intent: "want",\s*cards: addCard\(/,
    );
    expect(read("src/app/api/v1/cards/[cardId]/route.ts")).toContain(
      "cardResultById(id.data)",
    );
  });

  it("a card's + adds without opening anything, then is a ✓", () => {
    const sheet = read("mobile/src/screens/card.tsx");
    expect(sheet).toContain("<CartToast");
    expect(sheet).toContain("done={shownInCart}");
    const button = read("src/components/flares/flare-button.tsx");
    expect(button).toContain("addToCart(cardId, printing)");
    expect(button).toContain("View Flare ({count})");
  });

  it("the + elsewhere wears the cart's count and opens the full cart", () => {
    expect(read("mobile/src/dock.tsx")).toContain("count={cartCount()}");
    expect(read("mobile/src/flare-button.tsx")).toContain(
      '{count > 99 ? "99+" : count}',
    );
    expect(read("src/components/flares/flare-button.tsx")).toContain(
      '{count > 99 ? "99+" : count}',
    );
  });
});

describe("the composer says only what the cards do not", () => {
  it("has no title line, steps, counts or card numbers; a room is named", () => {
    const app = read("mobile/src/screens/flare-composer.tsx");
    expect(app).not.toContain("<Title>Post a Flare</Title>");
    expect(app).not.toContain(
      '<Muted>{LOCAL_ENABLED ? "To friends and nearby" : "To friends"}</Muted>',
    );
    expect(app).toContain("`In room ${target.code}`");
    expect(read("mobile/src/card-tray.tsx")).not.toContain("{index + 1}");
    const web = read("src/components/flares/flare-composer.tsx");
    expect(web).not.toContain("Posting to your area.");
    expect(web).not.toContain(">Cards in this flare<");
    expect(web).not.toMatch(/>\s*Cover\s*</);
    expect(web).toContain("In {room.name} at {room.storeName}");
  });
});
