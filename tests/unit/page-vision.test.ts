import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALIGN_BELOW,
  cornersMakeAPage,
  fitHomography,
  applyHomography,
  gridConfidence,
  idealCard,
  orderCorners,
  slotName,
  SLOT_NAMES,
  type Quad,
} from "@/lib/cards/page-geometry";
import { readPagePhoto } from "@/lib/cards/page-vision";
import {
  middleColour,
  nearestSlot,
  PAGE_H,
  PAGE_W,
  photographed,
} from "../helpers/binder-photo";

/**
 * Finding a binder page and its nine pockets in a photo. The founder
 * (2026-10-13): "Each 3x3 binder pocket must be assigned a fixed,
 * permanent coordinate", "detect binder edges ... apply perspective
 * correction", "detect empty pockets", and when unsure "manual alignment"
 * rather than a guess. Each cut-out pocket's colour is checked against
 * the card that sits there, so a card one pocket over fails.
 * `npm run scan:sweep` runs the long version of this, 122 photos.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

async function check(
  options: Parameters<typeof photographed>[0] & { empty?: number[] },
) {
  const vision = await readPagePhoto(await photographed(options));
  const shows = await Promise.all(
    vision.pockets.map(async (p) => nearestSlot(await middleColour(p.jpeg))),
  );
  return { vision, shows };
}

describe("the pocket names", () => {
  it("are A1 to C3, top row first, and never move", () => {
    expect(SLOT_NAMES).toEqual(["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"]);
    expect(slotName(0)).toBe("A1");
    expect(slotName(4)).toBe("B2");
    expect(slotName(8)).toBe("C3");
  });
});

describe("the geometry", () => {
  it("fits a perspective map exactly from four corners", () => {
    const from = idealCard(0, { x: 0.06, y: 0.06 });
    const to: Quad = [
      { x: 110, y: 90 },
      { x: 300, y: 100 },
      { x: 320, y: 380 },
      { x: 90, y: 360 },
    ];
    const h = fitHomography(from, to);
    expect(h).not.toBeNull();
    from.forEach((p, k) => {
      const q = applyHomography(h as number[], p);
      expect(q.x).toBeCloseTo(to[k].x, 3);
      expect(q.y).toBeCloseTo(to[k].y, 3);
    });
  });

  it("orders corners by where they sit", () => {
    const quad = orderCorners([
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(quad).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("takes a player's corners only when they make a page, in their own order", () => {
    const page: Quad = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    expect(cornersMakeAPage(page)).toBe(true);
    /* Turned: A1's corner is another one, still clockwise. */
    expect(cornersMakeAPage([page[1], page[2], page[3], page[0]])).toBe(true);
    /* Mirrored, crossed, tiny, or far outside the photo: refused. */
    expect(cornersMakeAPage([page[0], page[3], page[2], page[1]])).toBe(false);
    expect(cornersMakeAPage([page[0], page[2], page[1], page[3]])).toBe(false);
    expect(
      cornersMakeAPage([
        { x: 0.5, y: 0.5 },
        { x: 0.52, y: 0.5 },
        { x: 0.52, y: 0.52 },
        { x: 0.5, y: 0.52 },
      ]),
    ).toBe(false);
    expect(cornersMakeAPage([{ x: -1, y: 0 }, page[1], page[2], page[3]])).toBe(false);
  });

  it("does not trust a loose fit or a thin one", () => {
    const placed = Array.from({ length: 9 }, (_, slot) => ({ slot, card: slot }));
    expect(gridConfidence({ placed, error: 0.01 })).toBeGreaterThanOrEqual(ALIGN_BELOW);
    expect(gridConfidence({ placed, error: 0.08 })).toBeLessThan(ALIGN_BELOW);
    expect(gridConfidence(null)).toBe(0);
  });
});

describe("photos of a page", { timeout: 60_000 }, () => {
  it("finds all nine pockets of a page shot square on", async () => {
    const { vision, shows } = await check({});
    expect(vision.method).toBe("cards");
    expect(vision.needsAlignment).toBe(false);
    expect(shows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(vision.pockets.every((p) => !p.looksEmpty)).toBe(true);
  });

  it("keeps every card in its own pocket and sees the empty ones", async () => {
    const { vision, shows } = await check({ empty: [1, 5, 6] });
    expect(vision.needsAlignment).toBe(false);
    expect(vision.pockets.filter((p) => p.looksEmpty).map((p) => p.slot)).toEqual([
      1, 5, 6,
    ]);
    for (const slot of [0, 2, 3, 4, 7, 8]) expect(shows[slot]).toBe(slot);
  });

  it("straightens a tilted page", async () => {
    const { vision, shows } = await check({ rotate: 9 });
    expect(vision.needsAlignment).toBe(false);
    expect(shows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("corrects perspective", async () => {
    const { vision, shows } = await check({ skew: 0.14, rotate: -7 });
    expect(vision.needsAlignment).toBe(false);
    expect(shows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("places a row with a gap in it by the spacing, not the nearest column", async () => {
    /* The founder's kind of page: A1 slid into A2 before this. */
    const { vision, shows } = await check({ empty: [1, 5], rotate: 5, skew: 0.12 });
    if (vision.needsAlignment) return;
    expect(vision.pockets.filter((p) => p.looksEmpty).map((p) => p.slot)).toEqual([
      1, 5,
    ]);
    for (const slot of [0, 2, 3, 4, 6, 7, 8]) expect(shows[slot]).toBe(slot);
  });

  it("places a page with a gap in every row (no full row to learn from)", async () => {
    const { vision, shows } = await check({ empty: [0, 4, 8], rotate: -7 });
    if (vision.needsAlignment) return;
    for (const slot of [1, 2, 3, 5, 6, 7]) expect(shows[slot]).toBe(slot);
    expect(vision.pockets.filter((p) => p.looksEmpty).map((p) => p.slot)).toEqual([
      0, 4, 8,
    ]);
  });

  it("flags glare", async () => {
    const { vision } = await check({ glare: [4, 8] });
    expect(vision.pockets.filter((p) => p.glare).map((p) => p.slot)).toEqual([4, 8]);
  });

  it("asks the player to line up a page on its side rather than guess which way", async () => {
    const { vision } = await check({ rotate: 90 });
    expect(vision.needsAlignment).toBe(true);
    expect(vision.confidence).toBeLessThan(ALIGN_BELOW);
  });

  it("cuts the pockets from the player's own corners, in the order they gave", async () => {
    /* A page turned a quarter clockwise: A1's corner is now top right. */
    const photo = await photographed({ rotate: 90 });
    const w = PAGE_W + 240;
    const h = PAGE_H + 240;
    /* (x, y) on the upright photo lands at (h - y, x) once turned; as shares of h by w. */
    const at = (x: number, y: number) => ({ x: (h - y) / h, y: x / w });
    const corners: Quad = [
      at(120, 120),
      at(120 + PAGE_W, 120),
      at(120 + PAGE_W, 120 + PAGE_H),
      at(120, 120 + PAGE_H),
    ];
    const vision = await readPagePhoto(photo, corners);
    expect(vision.method).toBe("manual");
    expect(vision.needsAlignment).toBe(false);
    const shows = await Promise.all(
      vision.pockets.map(async (q) => nearestSlot(await middleColour(q.jpeg))),
    );
    expect(shows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("photos the installed app cut at its guide", { timeout: 60_000 }, () => {
  /* The page cut exactly at its edges, or a little inside them, as a page
     that fills the app's outline is. */
  async function cutAtGuide(inset: number, empty: number[] = []) {
    const sharp = (await import("sharp")).default;
    const photo = await photographed({ empty });
    const dx = Math.round(PAGE_W * inset);
    const dy = Math.round(PAGE_H * inset);
    return new Uint8Array(
      await sharp(photo)
        .extract({
          left: 120 + dx,
          top: 120 + dy,
          width: PAGE_W - 2 * dx,
          height: PAGE_H - 2 * dy,
        })
        .resize({ height: 1568 })
        .jpeg({ quality: 70 })
        .toBuffer(),
    );
  }

  it("finds cards the photo's edge cuts through", async () => {
    const vision = await readPagePhoto(await cutAtGuide(0.04, [1, 5]), undefined, {
      framed: true,
    });
    expect(vision.method).toBe("cards");
    expect(vision.needsAlignment).toBe(false);
    expect(vision.guided).toBe(false);
    expect(vision.pockets.filter((p) => p.looksEmpty).map((p) => p.slot)).toEqual([
      1, 5,
    ]);
    const shows = await Promise.all(
      vision.pockets.map(async (p) => nearestSlot(await middleColour(p.jpeg))),
    );
    for (const slot of [0, 2, 3, 4, 6, 7, 8]) expect(shows[slot]).toBe(slot);
  });

  it("falls back to the guide, every pocket to be checked, rather than sending the page back", async () => {
    const photo = await cutAtGuide(0.1);
    const guided = await readPagePhoto(photo, undefined, { framed: true });
    expect(guided).toMatchObject({
      method: "frame",
      needsAlignment: false,
      guided: true,
    });
    /* The same photo from a build that can line a page up: it asks. */
    expect((await readPagePhoto(photo)).needsAlignment).toBe(true);
    const jobs = read("src/lib/cards/page-jobs.ts");
    expect(jobs).toContain("...(input.pockets ? { framed: true } : {}),");
    expect(jobs).toMatch(
      /read\.ok && vision\.guided\s*\?\s*\{ \.\.\.read, pockets: read\.pockets\.map\(checkedByHand\) \}/,
    );
  });
});

describe("where it runs", () => {
  it("is loaded by the server only, from node_modules, and traced into the routes that read pages", () => {
    const config = read("next.config.ts");
    expect(config).toContain('serverExternalPackages: ["@techstark/opencv-js"]');
    expect(config).toContain('"./node_modules/@techstark/opencv-js/dist/opencv.js"');
    for (const route of [
      '"/api/v1/scans/pages"',
      '"/profile/binders/*"',
      '"/admin/scanner"',
    ]) {
      expect(config).toContain(route);
    }
    expect(read("src/lib/cards/page-vision.ts")).toMatch(/^import "server-only";/);
  });
});
