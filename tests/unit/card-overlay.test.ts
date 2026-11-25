import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A card opens over the screen it was tapped on, the background dimmed,
 * everywhere a card opens (the founder, 2026-11-25), on both platforms.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a card opens over the page", () => {
  it("in the app: the Card route is a fading, see-through modal with a dimmed backdrop", () => {
    const app = read("mobile/App.tsx");
    expect(app).toMatch(
      /name="Card"\s*options=\{\{\s*title: "Card",\s*headerShown: false,\s*presentation: "transparentModal",\s*animation: "fade",/,
    );
    const screen = read("mobile/src/screens/card.tsx");
    expect(screen).toContain('accessibilityLabel="Close card"');
    expect(screen).toContain('backgroundColor: "rgba(0,0,0,0.72)"');
    expect(screen.match(/<CardOverlay>/g)?.length).toBe(2);
  });

  it("on the website: /cards/[cardId] is intercepted into a modal slot, and still a page", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/@modal/(.)cards/[cardId]/page.tsx")),
    ).toBe(true);
    expect(read("src/app/@modal/default.tsx")).toContain("return null;");
    expect(read("src/app/@modal/[...catchAll]/page.tsx")).toContain("return null;");
    expect(read("src/app/layout.tsx")).toContain("{modal}");
    const modal = read("src/components/cards/card-modal.tsx");
    expect(modal).toContain('aria-label="Close card"');
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain("router.back()");
    expect(existsSync(join(process.cwd(), "src/app/cards/[cardId]/page.tsx"))).toBe(
      true,
    );
  });
});
