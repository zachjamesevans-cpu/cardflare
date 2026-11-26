import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A card opens over the screen it was tapped on, the background dimmed,
 * everywhere a card opens (the founder, 2026-11-25), on both platforms.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a card opens over the page", () => {
  it("in the app: the Card route is iOS's own sheet, swiped down to close", () => {
    const app = read("mobile/App.tsx");
    expect(app).toMatch(
      /name="Card"[\s\S]*?options=\{\{\s*title: "Card",\s*headerShown: false,[\s\S]*?presentation: "formSheet",\s*sheetAllowedDetents: "fitToContents",[\s\S]*?gestureEnabled: true,/,
    );
    const screen = read("mobile/src/screens/card.tsx");
    expect(screen).toContain('accessibilityLabel="Close"');
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
    /* A sheet over a blurred page, pulled down to close. */
    expect(modal).toContain("backdrop-blur-md");
    expect(modal).toContain("DRAG_CLOSE_PX");
    expect(existsSync(join(process.cwd(), "src/app/cards/[cardId]/page.tsx"))).toBe(
      true,
    );
  });
});

describe("sheets stand on frosted glass", () => {
  /* "a unified design language where this also kinda blurs into frame",
     then option A: a picture floats on blur, anything you work in stands
     on frosted glass, pages are solid. */
  it("frosts the card sheet and the composer sheet, and the website's pop-up", () => {
    expect(read("mobile/src/frosted.tsx")).toContain(
      '<BlurView intensity={70} tint="dark"',
    );
    expect(read("mobile/src/screens/card.tsx")).toContain(
      "<Frosted style={{ bottom: -600 }} />",
    );
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "{inSheet ? <Frosted style={{ bottom: -600 }} /> : null}",
    );
    expect(read("mobile/src/header.tsx")).toContain("{inSheet ? <Frosted /> : null}");
    const app = read("mobile/App.tsx");
    expect(
      app.match(/contentStyle: \{ backgroundColor: "transparent" \}/g),
    ).toHaveLength(2);
    expect(read("src/components/cards/card-modal.tsx")).toContain(
      "bg-surface/70 shadow-[var(--shadow-panel)] backdrop-blur-2xl",
    );
  });
});
