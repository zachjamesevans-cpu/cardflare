import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A card opens over the screen it was tapped on, the background dimmed,
 * everywhere a card opens (the founder, 2026-11-25), on both platforms.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a card opens over the page", () => {
  /* "notice how when you click on a card in the feed, it blurs the
     background and stuff. thats what i thought you were building for the
     other elements, such as when you search a card." No sheet: the card
     floats on the blurred screen, closed by the X or a pull down. */
  it("in the app: the Card route floats on a blur, closed by the X or a pull down", () => {
    const app = read("mobile/App.tsx");
    expect(app).toMatch(
      /name="Card"[\s\S]*?options=\{\{\s*title: "Card",\s*headerShown: false,[\s\S]*?presentation: "transparentModal",\s*animation: "fade",/,
    );
    const screen = read("mobile/src/screens/card.tsx");
    expect(screen).toContain('accessibilityLabel="Close"');
    expect(screen).toContain('<BlurView intensity={40} tint="dark"');
    expect(screen).toContain(
      "if (event.nativeEvent.contentOffset.y < -90) navigation.goBack();",
    );
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
    /* No panel: the card floats on the blurred page, as the zoom does. */
    expect(modal).toContain("bg-black/50 backdrop-blur-[14px]");
    expect(modal).not.toContain("bg-surface");
    expect(existsSync(join(process.cwd(), "src/app/cards/[cardId]/page.tsx"))).toBe(
      true,
    );
  });
});

describe("sheets stand on frosted glass", () => {
  /* "a unified design language where this also kinda blurs into frame",
     then option A: a picture floats on blur, anything you work in stands
     on frosted glass, pages are solid. */
  it("frosts the composer sheet (the card floats on blur instead)", () => {
    expect(read("mobile/src/frosted.tsx")).toContain(
      '<BlurView intensity={70} tint="dark"',
    );
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "{inSheet ? <Frosted style={{ bottom: -600 }} /> : null}",
    );
    expect(read("mobile/src/header.tsx")).toContain("{inSheet ? <Frosted /> : null}");
    const app = read("mobile/App.tsx");
    expect(
      app.match(/contentStyle: \{ backgroundColor: "transparent" \}/g),
    ).toHaveLength(2);
  });
});

describe("a card reads as one centred column", () => {
  /* "all the text is centered for the card, then market price on left
     hand side." The price block and the section headings centre; the
     rows of a list stay left, to scan. */
  it("centres the price block and the headings, on both", () => {
    const appPrices = read("mobile/src/card-prices.tsx");
    expect(appPrices).toContain('justifyContent: "center", gap: 6 }}>');
    const card = read("mobile/src/screens/card.tsx");
    expect(card).toContain(
      '<View style={{ alignItems: "center" }}>\n        <Title>{heading}</Title>',
    );
    const webPrices = read("src/components/cards/card-prices.tsx");
    expect(webPrices).toContain("flex items-center justify-center gap-1.5");
    expect(read("src/components/cards/card-page.tsx")).toContain(
      "text-center text-xs font-semibold tracking-[0.14em]",
    );
  });
});
