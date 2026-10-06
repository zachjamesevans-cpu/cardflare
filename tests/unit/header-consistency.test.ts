import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HEADER, HEADER_ICON_INSET } from "../../mobile/src/header-metrics";

/**
 * One header, one dock, both platforms.
 *
 * The founder (2026-10-06): "remove all of these weird 'bubbles' around
 * icons - they all seem kinda off center", "the 3 dots on one page
 * should be exactly the same elsewhere", and "Delete the text below all
 * of the tabs and tighten up the dock." Read off the source: the app
 * has no renderer here, so where a glyph lands on a phone still wants a
 * look on a device.
 */
const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function filesUnder(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const app = read("mobile/App.tsx");
const header = read("mobile/src/header.tsx");
const feedHeader = read("mobile/src/collapsing-header.tsx");

describe("the app's header", () => {
  it("puts every glyph 16pt from the edge, in a 44pt box", () => {
    expect(HEADER.slot).toBe(44);
    expect(HEADER.icon).toBe(24);
    expect(HEADER_ICON_INSET).toBe(16);
  });

  it("is ours on pushed screens and tab screens alike, never the native bar", () => {
    expect(app).toContain("header: (props) => <StackHeader {...props} />");
    expect(app).toContain("header: (props) => <TabHeader {...props} />");
    /* Nothing styles the native bar any more: it is never drawn. */
    expect(spoken(app)).not.toContain("headerStyle:");
    expect(spoken(app)).not.toContain("headerLeft:");
    expect(spoken(app)).not.toContain("function HeaderBack(");
  });

  it("draws one button shape: a fixed box with the glyph centred and no padding", () => {
    const button = header.slice(
      header.indexOf("export function HeaderButton("),
      header.indexOf("export function AppHeader("),
    );
    expect(button).toContain("width: HEADER.slot,");
    expect(button).toContain("height: HEADER.slot,");
    expect(button).toContain('alignItems: "center",');
    expect(button).toContain('justifyContent: "center",');
    expect(button).toContain("size={HEADER.icon}");
    expect(spoken(button)).not.toMatch(/padding/);
  });

  it("centres the title on the screen and pins each side at HEADER.edge", () => {
    expect(header).toContain("left: HEADER.edge + HEADER.slot,");
    expect(header).toContain("right: HEADER.edge + HEADER.slot,");
    expect(header).toContain("left: HEADER.edge,");
    expect(header).toContain("right: HEADER.edge,");
  });

  it("sits the Feed's + and bell in the same slots as every other screen", () => {
    expect(feedHeader).toContain("export const HEADER_CONTENT_HEIGHT = HEADER.height;");
    expect(feedHeader).toContain("left: HEADER.edge,");
    expect(feedHeader).toContain("right: HEADER.edge,");
    expect(feedHeader.match(/<HeaderButton/g)).toHaveLength(2);
  });

  it("gives every screen's header button the shared one, so none sizes its own", () => {
    for (const path of filesUnder("mobile/src/screens")) {
      const source = spoken(read(path));
      let at = source.indexOf("headerRight:");
      while (at !== -1) {
        const block = source.slice(at, at + 400);
        expect(block, path).toContain("<HeaderButton");
        expect(block, path).not.toContain("<Ionicons");
        at = source.indexOf("headerRight:", at + 1);
      }
      expect(source, path).not.toContain("headerLeft:");
    }
  });
});

describe("the dock", () => {
  it("is icons only and tighter in the app", () => {
    expect(app).toContain("tabBarShowLabel: false,");
    expect(app).toContain("size={TAB_BAR.icon}");
    const glass = read("mobile/src/glass.tsx");
    expect(glass).toContain("height: 50,");
    expect(glass).toContain("icon: 26,");
  });

  it("is icons only on the website, with each name kept for a screen reader", () => {
    const tabs = read("src/components/players/player-tabs.tsx");
    expect(tabs).toContain('<Icon className="size-6.5" aria-hidden="true" />');
    expect(tabs).toMatch(/<span className="sr-only">\s*\{tab\.label\}/);
    expect(spoken(tabs)).not.toContain("text-[11px]");
  });
});

describe("the website's header icons", () => {
  const shared = read("src/components/ui/header-button.ts");

  it("share the app's box and glyph: 44px and 24px, nothing drawn behind", () => {
    expect(shared).toContain("size-11");
    expect(shared).toContain('export const HEADER_ICON = "size-6";');
    expect(shared).not.toMatch(/\bborder\b|bg-surface|bg-elevated/);
    /* No margins: the gutter places every one the same distance in. */
    expect(shared).not.toMatch(/-m[lrx]-/);
  });

  it("are used by every header icon, with no circle left around any of them", () => {
    for (const path of [
      "src/app/feed/page.tsx",
      "src/components/feed/notification-bell.tsx",
      "src/components/ui/back-link.tsx",
      "src/components/nights/code-sheet.tsx",
      "src/components/binder/binder-page.tsx",
      "src/components/players/hunt-binder.tsx",
      "src/components/local/local-screen.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toMatch(/HEADER_(BUTTON|BACK)\b/);
      expect(source, path).not.toContain(
        "size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface",
      );
    }
    expect(read("src/components/local/local-screen.tsx")).toContain(
      "label={`More about ${name}`} header />",
    );
  });

  it("put the back chevron in the accent, as the app's is, and only the accent", () => {
    expect(read("src/components/ui/back-link.tsx")).toContain(
      "className={cn(HEADER_BACK, className)}",
    );
    expect(shared).toContain(
      "export const HEADER_BACK = `${BOX} text-accent hover:text-accent-hover`;",
    );
    /* The shared box carries no colour, so the two never stack. */
    const box = shared.slice(
      shared.indexOf("const BOX ="),
      shared.indexOf("export const HEADER_BUTTON"),
    );
    expect(box).not.toMatch(/text-(text|accent)/);
  });
});
