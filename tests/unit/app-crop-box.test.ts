import { describe, expect, it } from "vitest";

import {
  centredCrop as appCentred,
  clampCrop as appClamp,
  cropFor as appCropFor,
  cropInPixels,
  drawFor,
} from "../../mobile/src/crop-box";
import {
  centredCrop as webCentred,
  clampCrop as webClamp,
  cropFor as webCropFor,
} from "@/lib/players/image-pipeline";
import { readFileSync } from "node:fs";

/**
 * The app crops the way the website crops.
 *
 * The founder: "the crop feature is completely gone since this last
 * merge... showing a 'phantom' view of their profile and they can crop
 * it with that UI so they can see exactly what it'll look like." The
 * crop maths is one set of rules stated twice, so every case walks
 * through both statements of it here.
 */
describe("the app's crop box matches the website's", () => {
  const cases = [
    [1600, 900, 1, 1, { x: 0.5, y: 0.5 }],
    [900, 1600, 1, 1, { x: 0.5, y: 0.5 }],
    [1600, 900, 4 / 3, 2, { x: 0.2, y: 0.9 }],
    [3000, 4000, 4 / 3, 1.5, { x: 0.5, y: 0.1 }],
    [500, 500, 1, 5, { x: 0, y: 1 }],
  ] as const;

  it.each(cases)("%i x %i at aspect %f, zoom %f", (w, h, aspect, zoom, centre) => {
    expect(appCentred(w, h, aspect)).toEqual(webCentred(w, h, aspect));
    expect(appCropFor(w, h, aspect, zoom, centre)).toEqual(
      webCropFor(w, h, aspect, zoom, centre),
    );
  });

  it("clamps the same way", () => {
    const box = { x: -0.2, y: 0.9, width: 0.5, height: 2 };
    expect(appClamp(box)).toEqual(webClamp(box));
  });
});

describe("drawing the crop into a frame", () => {
  it("puts the crop's corner at the frame's corner", () => {
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.5 };
    const drawn = drawFor(crop, 200, 200);
    expect(drawn.width).toBe(400);
    expect(drawn.height).toBe(400);
    expect(drawn.left).toBe(-100);
    expect(drawn.top).toBe(-40);
  });

  it("gives the manipulator whole pixels inside the picture", () => {
    const box = cropInPixels({ x: 0.5, y: 0.5, width: 0.6, height: 0.6 }, 1000, 800);
    expect(box.originX + box.width).toBeLessThanOrEqual(1000);
    expect(box.originY + box.height).toBeLessThanOrEqual(800);
    expect(box.width).toBeGreaterThan(0);
  });
});

describe("the crop sheet and the upload", () => {
  const sheet = readFileSync("mobile/src/crop-picture.tsx", "utf8");
  const picker = readFileSync("mobile/src/change-picture.ts", "utf8");
  const edit = readFileSync("mobile/src/screens/edit-profile.tsx", "utf8");

  it("draws the profile under the crop, with the crop in it", () => {
    expect(sheet).toContain("How it looks on your profile");
    expect(sheet).toContain("Crop your picture");
    expect(sheet).toContain("Crop your cover");
    /* The block's own geometry, so the preview is the profile. */
    expect(sheet).toContain("const COVER_HEIGHT = 144;");
    expect(sheet).toContain("const HEADER_TOP = 60;");
    expect(sheet).toContain("const AVATAR = 88;");
    expect(sheet).toContain("Drag to move. Pinch to zoom.");
  });

  it("sends the crop in the picture's own pixels, then resizes", () => {
    expect(picker).toContain("cropInPixels(crop, picked.width, picked.height)");
    expect(picker).toMatch(/\[\{ crop: box \}, \{ resize:/);
  });

  it("does not count chunks out loud any more", () => {
    /* The founder: "Why not just have a loading icon or something?" */
    expect(picker).not.toContain("of ${total}");
    expect(edit).toContain('busy={busy === "avatar"}');
    expect(edit).toContain('busy={busy === "cover"}');
    expect(edit).toContain("<CropSheet");
  });
});
