import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { COVER_HEIGHT, COVER_WIDTH } from "@/lib/players/profile-image";

/**
 * The shape a cover is cropped to, on both platforms and on the server.
 *
 * The founder's report: changing the profile banner left it "quite
 * zoomed in". Nothing was scaling wrongly — three numbers disagreed. The
 * cropper offered a 2.67:1 strip, the server stored 1200x450, and the
 * profile drew the result into a box about 1.3:1. Covering a 1.3 box
 * with a 2.67 image magnifies it a little over twice and discards half
 * the width, so the composition somebody chose was never the one they
 * got. A cropper that lies is worse than no cropper at all.
 *
 * They agree now, and this is what keeps them agreeing: the app hardcodes
 * its picker's aspect and cannot import the server's constants, exactly
 * like `local-shared` and `avatar-geometry` before it.
 */

const source = (path: string) => readFileSync(path, "utf8");

describe("the cover's shape", () => {
  it("is four by three on the server", () => {
    expect(COVER_WIDTH / COVER_HEIGHT).toBeCloseTo(4 / 3, 5);
  });

  it("is the same shape the app's cropper offers", () => {
    const profile = source("mobile/src/screens/profile.tsx");

    /* The tuple expo-image-picker is handed. Read rather than trusted,
       because the two files can only ever be held together from here. */
    const match = /aspect:\s*kind === "cover" \? \[(\d+), (\d+)\]/.exec(profile);
    expect(match, "the app's cover aspect could not be found").not.toBeNull();

    const [, width, height] = match!;
    expect(Number(width) / Number(height)).toBeCloseTo(COVER_WIDTH / COVER_HEIGHT, 5);
  });

  it("is the same shape the website's cropper offers", () => {
    /* The web passes the server's own constants straight through, which
       is the whole reason it cannot drift — assert that it still does
       rather than that the number is right. */
    const form = source("src/components/players/cover-form.tsx");

    expect(form).toContain("aspect={COVER_WIDTH / COVER_HEIGHT}");
  });

  it("keeps a picture square on both platforms", () => {
    const profile = source("mobile/src/screens/profile.tsx");
    const avatar = source("src/components/players/avatar-form.tsx");

    expect(profile).toContain('aspect: kind === "cover" ? [4, 3] : [1, 1]');
    expect(avatar).toContain("aspect={1}");
  });

  it("is taller than it is drawn anywhere but the profile, on purpose", () => {
    /*
     * Every other place a cover appears is wider and shorter — the peek's
     * strip, a desktop column — and crops the BOTTOM, which is the half
     * already dissolving into the card behind the name. Both platforms
     * anchor to the top so a face in the upper half survives.
     */
    expect(source("mobile/src/showcase-zoom.tsx")).toContain('contentPosition="top"');
    expect(source("src/components/players/profile-cover.tsx")).toContain("object-top");
  });
});

describe("what survives the crop", () => {
  it("keeps the top of the square a phone sends", () => {
    /*
     * iOS ignores the aspect an image picker asks for — its own types
     * say "on iOS the crop rectangle is always a square" — so a cover
     * from the app is a square somebody composed, and the server decides
     * which quarter of it to lose. Centre pushed the top of their
     * composition off the banner; both display layers have always
     * anchored to the top, and now the stored file agrees.
     */
    expect(source("src/lib/players/profile.ts")).toContain(
      'fit: "cover", position: "top"',
    );
  });
});
