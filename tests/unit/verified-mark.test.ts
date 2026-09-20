import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * cardflare Verified is one glyph, drawn everywhere a store's name is.
 *
 * The founder asked for "a small badge of a brick and mortar green
 * logo as a verification badge", and the decision that followed: the
 * mark is the badge everybody sees beside a store's name, on both
 * platforms, and Ultra is never drawn beside a name on a player's
 * screen. These are pins on the source, because a page that quietly
 * kept the library tick, or an app that kept the icon set's decagram,
 * would ship two different marks for one word.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/** The nearby-stores block of a feed source, up to the next feed kind. */
function nearbyBlock(source: string): string {
  const start = source.indexOf('"nearbyStores"');
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("item.kind ===", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the glyph", () => {
  it("exists on both platforms under the same name", () => {
    const web = read("src/components/stores/verified-mark.tsx");
    const app = read("mobile/src/verified-mark.tsx");

    expect(web).toContain("export function VerifiedMark(");
    expect(app).toContain("export function VerifiedMark(");
    /* The same words for screen readers on both. */
    expect(web).toContain("cardflare Verified");
    expect(app).toContain("cardflare Verified");
  });
});

describe("a room carries the store's trust", () => {
  it("is on the public event and read from the store row", () => {
    const schema = read("src/lib/events/schema.ts");
    const shape = schema.slice(
      schema.indexOf("export interface PublicEvent"),
      schema.indexOf("export type RoomPhase"),
    );
    expect(shape).toContain("storeVerified: boolean");

    const repo = read("src/lib/events/repository.ts");
    expect(repo).toMatch(/PUBLIC_ROOM_COLUMNS =\s*"[^"]*verified_at[^"]*"/);
    expect(repo).toContain("storeVerified:");
  });

  it("reaches the app as `verified` on the room", () => {
    const route = read("src/app/api/v1/rooms/[code]/route.ts");
    expect(route).toContain("verified: room.storeVerified");

    const api = read("mobile/src/api.ts");
    const room = api.slice(
      api.indexOf("export interface RoomState"),
      api.indexOf("you?: {", api.indexOf("export interface RoomState")),
    );
    expect(room).toContain("verified?: boolean");
  });
});

describe("the mark beside a store's name", () => {
  it("is in the room header on both platforms", () => {
    const web = read("src/app/e/[code]/page.tsx");
    expect(web).toContain('from "@/components/stores/verified-mark"');
    expect(web).toContain("{event.storeVerified && <VerifiedMark");

    const app = read("mobile/src/screens/room.tsx");
    expect(app).toContain('from "../verified-mark"');
    /* Both store-name taps: the join screen and the door card. */
    expect(app.match(/room\.verified \? <VerifiedMark/g)).toHaveLength(2);
  });

  it("is on the nearby store cards, and the old ticks are gone", () => {
    const web = read("src/components/feed/feed-items.tsx");
    const webNearby = nearbyBlock(web);
    expect(web).toContain('from "@/components/stores/verified-mark"');
    expect(webNearby).toContain("{store.verified && <VerifiedMark");
    expect(webNearby).not.toContain("BadgeCheck");

    const app = read("mobile/src/screens/home.tsx");
    const appNearby = nearbyBlock(app);
    expect(app).toContain('from "../verified-mark"');
    expect(appNearby).toContain("{store.verified ? <VerifiedMark");
    expect(app).not.toContain("check-decagram");
  });

  it("is the admin directory's mark too, with a click to earn it", () => {
    const directory = read("src/components/admin/store-directory.tsx");
    expect(directory).toContain('from "@/components/stores/verified-mark"');
    expect(directory).toContain("{store.verified && <VerifiedMark");
    expect(directory).not.toContain("<Badge>Verified</Badge>");
    /* Only where it is earned: Ultra and not yet verified. */
    expect(directory).toContain("{store.ultra && !store.verified && <VerifyButton");

    const controls = read("src/components/admin/store-listing-controls.tsx");
    expect(controls).toContain("export function VerifyButton(");
    const button = controls.slice(
      controls.indexOf("export function VerifyButton("),
      controls.indexOf("export function StoreListingControls("),
    );
    expect(button).toContain("useActionState(setVerifiedAction");
    expect(button).toContain('name="verified" value="true"');
  });
});
