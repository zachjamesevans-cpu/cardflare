import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CLAIM_ROLES } from "@/lib/stores/claim-schema";
import { USER_TYPES } from "@/lib/waitlist/schema";
import { userTypeForHash } from "@/lib/waitlist/preselect";
import { ANCHORS } from "@/lib/site";

/**
 * The words this round decided, pinned to the files that say them.
 *
 * FlareCast: "screen" is the thing a store manages, "TV" is the
 * hardware, "display link" is only the URL, and "FlareCast" is the
 * product's name. The console tabs all stand behind `loadStoreConsole`.
 * The landing page sells what is on, never a price. The invite form is
 * for vendors, because Max is by invitation and Ultra is self-serve.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");

const hub = read("src/app/store/event-hub/page.tsx");
const manage = read("src/app/store/event-hub/[displayId]/page.tsx");
const event = read("src/app/store/events/[id]/page.tsx");
const settings = read("src/components/event-hub/display-settings.tsx");
const wall = read("src/app/display/[token]/page.tsx");

describe("the console tabs stand behind one loader", () => {
  it.each([
    ["the FlareCast hub", hub],
    ["a screen's manage page", manage],
    ["an event's page", event],
  ])("%s goes through loadStoreConsole and not its own viewer check", (_name, page) => {
    expect(page).toContain("loadStoreConsole(");
    expect(page).not.toContain("getViewer");
    expect(page).not.toContain("consoleStoreIds");
    expect(page).not.toContain('from "next/navigation"\nimport { redirect');
    expect(page).not.toMatch(/\bredirect\(/);
  });

  it("the event page wears the tabs and goes back to the Events tab", () => {
    expect(event).toContain("<StoreTabs storeId={store.id} />");
    expect(event).toContain('consoleHref("/store/events", store.id)');
    expect(event).toContain("Back to all events");
    /* The old way back sent an admin to /admin and everyone else to the
       overview, which is neither the tab they came from nor consistent. */
    expect(event).not.toContain('viewer.kind === "admin" ? "/admin"');
  });
});

describe("FlareCast says screen, TV and display link", () => {
  it("the manage page opens the screen on the TV and names its display link", () => {
    expect(manage).toContain("Open on the TV");
    expect(manage).toContain("Screen settings");
    expect(manage).toContain("View display link");
    expect(manage).not.toContain("Open TV display");
    expect(manage).not.toContain("The television");
    /* Fullscreen and "nobody signs in" are said once, in the hub's
       About paragraph, and not again on every screen's page. */
    expect(manage).not.toContain("Enter Fullscreen");
    expect(manage).not.toContain("sign in");
    expect(hub).toContain("Enter Fullscreen");
  });

  it("the settings form saves screen settings and issues a display link", () => {
    expect(settings).toContain("Screen name");
    expect(settings).toContain('label="Save screen settings"');
    expect(settings).toContain("Issue a new display link");
    expect(settings).not.toContain("Save display settings");
  });

  it("the wall never calls the product Event Hub", () => {
    expect(wall).toContain('title: "FlareCast"');
    expect(wall).toContain("Open the screen&rsquo;s page in FlareCast");
    expect(wall).not.toContain("Event Hub");
  });

  it.each([
    ["the hub", hub],
    ["the manage page", manage],
    ["the settings form", settings],
    ["the wall", wall],
  ])("%s never says television in what a store reads", (_name, source) => {
    /* Code comments may still explain themselves however they like; the
       copy a store reads is what the word is banned from. */
    const copy = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(copy).not.toMatch(/television/i);
  });
});

describe("claiming a store", () => {
  it("offers the two roles the console has, spelled the American way", () => {
    expect([...CLAIM_ROLES]).toEqual(["Owner", "Organizer"]);
  });
});

describe("the landing page sells what is on", () => {
  const places = read("src/components/marketing/places.tsx");
  const found = read("src/components/marketing/found-panel.tsx");
  const hero = read("src/components/marketing/hero.tsx");
  const steps = read("src/components/marketing/how-it-works.tsx");
  const trio = read("src/components/marketing/audience-trio.tsx");
  const band = read("src/components/marketing/ultra-band.tsx");

  it("never shows a price on a card", () => {
    /* PRODUCT.md: never a price. The show row used to read "PSA 9 · $38". */
    expect(places).not.toMatch(/\$\d/);
  });

  it("calls the thing a Flare, not a Want List", () => {
    for (const source of [places, found, hero, steps]) {
      expect(source).not.toContain("Want List");
    }
    expect(found).toContain("Flare");
  });

  it("describes the room and followers unless Local is on", () => {
    for (const source of [places, found, hero, steps]) {
      expect(source).toContain("LOCAL_ENABLED");
    }
    expect(places).toContain('eyebrow: "In the room"');
    expect(hero).toContain("the players who follow you");
    expect(steps).toContain("The room, your followers");
  });

  it("sends stores to Ultra from the band and the pricing tile, not a third card", () => {
    expect(trio).not.toContain('eyebrow: "Stores"');
    expect(trio).not.toContain("for-stores");
    expect(band).not.toContain('id="for-stores"');
    expect(ANCHORS).not.toHaveProperty("forStores");
    expect(places).toContain("For stores\n");
    expect(places).not.toContain("For stores &amp; vendors");
  });
});

describe("the invite form is for vendors", () => {
  it("offers no store, player or creator type", () => {
    const values = USER_TYPES.map((type) => type.value);
    expect(values).toContain("vendor");
    expect(values).not.toContain("store");
    expect(values).not.toContain("player");
    expect(values).not.toContain("creator");
  });

  it("preselects only from the vendor anchor", () => {
    expect(userTypeForHash("#invite-vendor")).toBe("vendor");
    expect(userTypeForHash("#invite-store")).toBeNull();
  });

  it("points a store at Ultra instead", () => {
    const section = read("src/components/marketing/request-invite-section.tsx");
    expect(section).toContain('href="/ultra"');
    expect(section).not.toContain("STORE_PILOT");
    expect(read("src/lib/waitlist/preselect.ts")).not.toContain("STORE_PILOT");
  });
});

describe("the Ultra pitch", () => {
  const ultra = read("src/app/ultra/page.tsx");

  it("calls the inventory your singles and the shelf the case", () => {
    expect(ultra).toContain("Your singles, matched to every Flare");
    expect(ultra).toContain("The case: six cards from your singles");
    expect(ultra).not.toContain("singles in your case");
    expect(ultra).not.toContain("your case in front");
  });

  it("lists the store page, posts and the case, and the Verified mark", () => {
    expect(ultra).toContain("Your store page, with a Follow button");
    expect(ultra).toContain("Posts to your followers");
    expect(ultra).toContain("The Verified mark on your store page");
    expect(ultra).not.toContain("Ultra badge");
  });
});

describe("PRODUCT.md matches the product", () => {
  const product = read("PRODUCT.md");

  it("no longer says the landing page must hide that sign-up is open", () => {
    expect(product).not.toContain("must not imply the product has launched");
    expect(product).not.toContain("currently being built");
    expect(product).toContain("Sign-up is open.");
  });

  it("no longer claims the Feed has no comments, since posts have threads", () => {
    expect(product).not.toMatch(/no comments/i);
    expect(product).toContain("thread");
  });
});
