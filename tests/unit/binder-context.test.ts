import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  binderStatusLabel,
  wantedNearbyLine,
} from "@/lib/binder/binder-status";
import { wantedInBinder } from "@/lib/nearby/matching";

/**
 * The binder page without its always-present sentences (2026-11-22).
 * The founder: "i dont like how there's just this small text above and
 * below that isnt contextual. it's just always present." So: a status
 * pill instead of the sentence under the title, a "wanted nearby" line
 * only when somebody nearby wants a card, the move tip only until the
 * owner has held a card, and one loud "+ Add" pocket per page.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const web = {
  view: read("src/components/binder/binder-page.tsx"),
  pockets: read("src/components/binder/pockets.tsx"),
  status: read("src/lib/binder/binder-status.ts"),
  route: read("src/app/api/v1/binders/[binderId]/wanted/route.ts"),
  ownerPage: read("src/app/profile/binders/[binderId]/page.tsx"),
};
const app = {
  binder: read("mobile/src/screens/binder.tsx"),
  pockets: read("mobile/src/pockets.tsx"),
  status: read("mobile/src/binder-status.ts"),
  api: read("mobile/src/api.ts"),
};

/** Every string literal in a file, in order. */
const literals = (source: string) =>
  [...source.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]);

describe("the binder's words", () => {
  it("are the same on both platforms", () => {
    expect(literals(app.status)).toEqual(literals(web.status));
  });

  it("name the switch in a pill", () => {
    expect(binderStatusLabel(true, true)).toBe("Up for trade");
    expect(binderStatusLabel(false, true)).toBe("On profile");
    expect(binderStatusLabel(false, false)).toBe("Private");
  });

  it("count the wanted cards in plain English", () => {
    expect(wantedNearbyLine(1)).toBe("1 of these is wanted nearby");
    expect(wantedNearbyLine(3)).toBe("3 of these are wanted nearby");
  });
});

describe("wanted nearby", () => {
  it("counts only this binder's cards, and only the wanted ones", () => {
    expect(wantedInBinder({ a: 2, b: 1, c: 0, d: 4 }, ["a", "c", "x"])).toEqual({ a: 2 });
  });

  it("is the owner's, for a binder up for trade, and nobody else's", () => {
    expect(web.route).toContain("readBinder(player.playerId, player.playerId, id.data)");
    expect(web.route).toContain("if (!binder?.yours || !binder.forTrade) return Response.json({ wanted: {} });");
    expect(web.ownerPage).toContain("const wanted = binder.forTrade");
  });

  it("never breaks the app against a server without the read", () => {
    const fn = app.api.slice(app.api.indexOf("export const getBinderWanted"));
    expect(fn).toMatch(/catch \{\s*return \{\};/);
  });

  it("shows only when there is something to say, and leads to the list", () => {
    expect(web.view).toContain("binder.yours && settings.forTrade && wantedCount > 0 && (");
    expect(web.view).toContain('href="/feed/wanted"');
    expect(app.binder).toContain("yours && wantedCount > 0 ? (");
    expect(app.binder).toContain('navigation.navigate("WantedNearYou")');
  });

  it("marks the wanted pockets with ON YOUR HUNT's strip", () => {
    expect(web.pockets).toContain('{card.onYourHunt ? "ON YOUR HUNT" : WANTED_STRIP}');
    expect(app.binder).toContain(
      'const strip = card.onYourHunt ? "ON YOUR HUNT" : wanted ? WANTED_STRIP : null;',
    );
  });
});

describe("empty pockets", () => {
  it("say + Add once a page and stay quiet after, every one still a door", () => {
    expect(web.view).toContain("const firstEmpty = pockets.findIndex((entry) => !entry);");
    expect(web.view).toContain("quiet={index !== firstEmpty}");
    expect(app.binder).toContain("const firstEmpty = slots.findIndex((card) => !card);");
    expect(app.binder).toContain("quiet={index !== firstEmpty}");
    /* Quiet is a look, never a missing door: the founder, "Adding a
       card in a specific slot should put that exact card there." */
    expect(web.pockets).toContain("const look = quiet ? QUIET_POCKET : ADD_POCKET;");
    expect(app.pockets).toMatch(/quiet \? null : \(/);
    expect(app.pockets).toContain("onPress={onPress}");
  });
});
