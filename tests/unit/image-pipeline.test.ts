import { describe, expect, it } from "vitest";

import {
  centredCrop,
  clampCrop,
  cropFor,
  FULL_CROP,
  renamed,
} from "@/lib/players/image-pipeline";

/**
 * Getting a photo from a Mac into a 2MB bucket.
 *
 * The founder's report: "cant upload header photos on mac - may have a
 * high limit on MB size." A Retina screenshot is 4000px wide and several
 * megabytes, and the avatars bucket takes two — so the picker refused
 * pictures that were perfectly good.
 *
 * The encode itself needs a canvas and cannot run here (this project's
 * test runner is Node with no DOM), so what is covered is the geometry:
 * which rectangle is kept, and that it stays inside the picture however
 * somebody drags. Getting that wrong is how a cropper cuts somebody's
 * head off.
 */

describe("the rectangle a cropper opens on", () => {
  it("takes a full-height slice out of a wide photo", () => {
    /* 3000x2000 into a square: the middle two thousand pixels. */
    const box = centredCrop(3000, 2000, 1);

    expect(box.height).toBe(1);
    expect(box.width).toBeCloseTo(2 / 3, 5);
    expect(box.x).toBeCloseTo(1 / 6, 5);
    expect(box.y).toBe(0);
  });

  it("takes a full-width band out of a tall photo", () => {
    const box = centredCrop(1000, 2000, 1);

    expect(box.width).toBe(1);
    expect(box.height).toBeCloseTo(0.5, 5);
    expect(box.y).toBeCloseTo(0.25, 5);
  });

  it("keeps the whole picture when it is already the right shape", () => {
    expect(centredCrop(1200, 450, 1200 / 450)).toEqual(FULL_CROP);
  });

  it("crops a phone photo to a banner without stretching it", () => {
    /* The actual case: a 4032x3024 photo into a 1200x450 header. */
    const box = centredCrop(4032, 3024, 1200 / 450);

    expect(box.width).toBe(1);
    expect(box.height).toBeLessThan(1);
    /* Centred vertically, so a horizon lands in the middle. */
    expect(box.y).toBeCloseTo((1 - box.height) / 2, 5);
  });
});

describe("dragging and zooming", () => {
  it("shows less of the picture the further in you zoom", () => {
    const one = cropFor(2000, 2000, 1, 1, { x: 0.5, y: 0.5 });
    const two = cropFor(2000, 2000, 1, 2, { x: 0.5, y: 0.5 });

    expect(two.width).toBeCloseTo(one.width / 2, 5);
    expect(two.height).toBeCloseTo(one.height / 2, 5);
  });

  it("never zooms out past the whole picture", () => {
    /* A slider that went below 1 would letterbox, and a banner with bars
       down the side is not what anybody picked a photo for. */
    const out = cropFor(2000, 2000, 1, 0.2, { x: 0.5, y: 0.5 });
    expect(out.width).toBeLessThanOrEqual(1);
    expect(out.height).toBeLessThanOrEqual(1);
  });

  it.each([
    [{ x: -5, y: 0.5 }],
    [{ x: 5, y: 0.5 }],
    [{ x: 0.5, y: -5 }],
    [{ x: 0.5, y: 5 }],
  ])("stays inside the picture however far it is dragged (%j)", (centre) => {
    const box = cropFor(3000, 2000, 1, 2, centre);

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1.000001);
    expect(box.y + box.height).toBeLessThanOrEqual(1.000001);
  });

  it("refuses a box with no picture in it", () => {
    const box = clampCrop({ x: 0.5, y: 0.5, width: 0, height: 0 });

    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe("naming what comes out", () => {
  it("keeps the name and says what it actually is", () => {
    /* The bytes are JPEG now whatever went in, and a file called
       "banner.png" that is not a PNG is a small lie that confuses
       whoever looks at the bucket. */
    expect(renamed("Screenshot 2026-08-18 at 14.02.11.png")).toBe(
      "Screenshot 2026-08-18 at 14.02.11.jpg",
    );
    expect(renamed("photo.HEIC")).toBe("photo.jpg");
    expect(renamed("")).toBe("image.jpg");
  });

  it("does not carry a novel of a filename into the bucket", () => {
    expect(renamed("x".repeat(400)).length).toBeLessThanOrEqual(64);
  });
});
