import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's loading state and the Room tile, read off their source.
 *
 * The founder, on the app's Room: "the 'loading' screen everywhere
 * needs to be updated. Maybe just a rotating green thing... not pretty
 * to go into a room and there's just this tiny 'loading' text in top
 * left." And on the tile: "the small contextual menu that opens up
 * over the tiny card needs to go... just have people tap the card to
 * open full menu to say they have it or not."
 *
 * So one `Loading` primitive in ui.tsx, a centred spinner in the
 * accent, and no screen left drawing "Loading…" as a line of muted
 * text; and a board tile with no offer control and no stepper of its
 * own, the zoom sheet being the one place to answer a card.
 *
 * Read off the source because the test runner is Node with no renderer.
 */
const mobile = resolve(__dirname, "../../mobile/src");
const read = (path: string) => readFileSync(join(mobile, path), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("Loading, the app's one loading state", () => {
  const ui = read("ui.tsx");
  const start = ui.indexOf("export function Loading(");
  const body = ui.slice(start, ui.indexOf("\n}\n", start));

  it("is exported from ui.tsx as a centred accent spinner", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('<ActivityIndicator size="large" color={colors.accent} />');
    expect(body).toContain('accessibilityRole="progressbar"');
    expect(body).toContain('accessibilityLabel="Loading"');
    expect(ui).toMatch(
      /loading: \{[^}]*alignItems: "center"[^}]*justifyContent: "center"/s,
    );
  });

  it("carries its label only when given one", () => {
    expect(body).toContain("{label ? <Muted>{label}</Muted> : null}");
  });

  it("has replaced every muted 'Loading…' line in the app", () => {
    const offenders = walk(mobile)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        return /<Muted>Loading…<\/Muted>|"Loading…"|Loading the room…/.test(source);
      })
      .map((file) => file.slice(mobile.length + 1));
    expect(offenders).toEqual([]);
  });

  it("is what the Room, the Feed and the Inbox draw while they wait", () => {
    expect(read("screens/room.tsx")).toContain('<Loading label="Opening the room" />');
    expect(read("screens/home.tsx")).toContain(
      "{!hydrated && shown.length === 0 && <Loading />}",
    );
    expect(read("screens/inbox.tsx")).toContain("{items === null && <Loading />}");
  });
});

describe("the Room tile answers a card through the zoom sheet only", () => {
  const room = read("screens/room.tsx");
  const start = room.indexOf("function CarouselFlare(");
  const tile = room.slice(start, room.indexOf("\nfunction FlareRow(", start));

  it("has no handshake button and no stepper over the art", () => {
    expect(tile).not.toContain('"handshake-outline"');
    expect(tile).not.toContain("stepperPanel");
    expect(tile).not.toContain("pledgeButton");
    expect(tile).not.toContain("setPicking");
    expect(room).not.toMatch(/\n  stepper\w*: \{/);
    expect(room).not.toMatch(/\n  pledgeButton\w*: \{/);
  });

  it("reserves the action row only under the viewer's own tiles", () => {
    expect(tile).toMatch(/\{mine && \(\s*<View style=\{\{ height: 24 \}\}>/);
    expect(tile).toContain("Remove");
  });

  it("still hands the sheet the offer on somebody else's want", () => {
    expect(room).toContain('offer:\n              mine || f.intent === "showcase"');
    expect(room).toContain("onWithdraw: () => act(() => withdrawOffer(code, f.id))");
  });
});

describe("the Following tab is one timeline", () => {
  it("draws no section headings there", () => {
    expect(read("screens/home.tsx")).toContain(
      'const heading = tab === "following" ? null : sectionHeading(item.section);',
    );
  });
});
