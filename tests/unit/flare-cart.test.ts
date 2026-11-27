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

  /* The founder (2026-11-27): "you should be able to tap the + button 4
     times quickly to add 4 copies." It stays a +, wearing "×4". */
  it("a card's + adds a copy per tap, without opening anything", () => {
    const sheet = read("mobile/src/screens/card.tsx");
    expect(sheet).toContain("<CartToast");
    expect(sheet).toContain("copies={shownCopies}");
    expect(sheet).not.toContain("done={shownInCart}");
    expect(read("mobile/src/flare-button.tsx")).toContain("`×${copies}`");
    const button = read("src/components/flares/flare-button.tsx");
    expect(button).toContain("addToCart(cardId, printing)");
    expect(button).toContain("View Flare ({count})");
    expect(button).toContain("`×${copies}`");
    expect(button).not.toContain("<Check");
  });

  it("adds one after another, so fast taps are all counted, on both platforms", () => {
    for (const path of [
      "mobile/src/flare-cart.ts",
      "src/components/flares/flare-cart.ts",
    ]) {
      const src = read(path);
      expect(src).toContain("const run = queue.then(");
      expect(src).toContain("queue = run.catch(() => undefined);");
      /* The badge counts copies, like a shopping bag. */
      expect(src).toMatch(/reduce\(\(sum, line\) => sum \+ line\.quantity, 0\)/);
    }
    expect(read("mobile/src/flare-cart.ts")).toContain("quantity: item.quantity + 1");
  });

  it("the + elsewhere wears the cart's count and opens the full cart", () => {
    expect(read("mobile/src/dock.tsx")).toContain("count={cartCount()}");
    expect(read("mobile/src/flare-button.tsx")).toContain(
      'count > 99 ? "99+" : count}',
    );
    expect(read("src/components/flares/flare-button.tsx")).toContain(
      'count > 99 ? "99+" : count}',
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
    /* No number drawn on a tile; VoiceOver still hears "card 2 of 5". */
    expect(read("mobile/src/card-tray.tsx")).not.toMatch(/>\s*\{index \+ 1\}\s*</);
    const web = read("src/components/flares/flare-composer.tsx");
    expect(web).not.toContain("Posting to your area.");
    expect(web).not.toContain(">Cards in this flare<");
    expect(web).not.toMatch(/>\s*Cover\s*</);
    expect(web).toContain("In {room.name} at {room.storeName}");
  });
});

describe("the composer sheet is only as tall as what is in it", () => {
  /* "there is no need for this screen to extend so far vertically ... it
     should slide up just below the preview button." */
  it("is an iOS form sheet fitted to its contents, with no tab-bar gap", () => {
    const app = read("mobile/App.tsx");
    const compose = app.slice(
      app.indexOf('name="Compose"'),
      app.indexOf('name="PostFlare"'),
    );
    expect(compose).toContain('presentation: "formSheet"');
    expect(compose).toContain('sheetAllowedDetents: "fitToContents"');
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "paddingBottom: spacing(4) + (inSheet ? insets.bottom : tabInset)",
    );
  });
});
