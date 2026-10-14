import "server-only";

import type * as OpenCv from "@techstark/opencv-js";
import { createRequire } from "node:module";

import {
  ALIGN_BELOW,
  CARD_RATIO,
  DEFAULT_GAPS,
  fitGrid,
  fitHomography,
  gridConfidence,
  idealCard,
  idealPage,
  mapQuad,
  orderCorners,
  type FoundCard,
  type GridGaps,
  type Homography,
  type Point,
  type Quad,
} from "@/lib/cards/page-geometry";

/**
 * The binder-page scanner's eyes: where the page is, where each of its
 * nine pockets is, and a sharp picture of each card.
 *
 * The founder (2026-10-13): "Do not rely on the language model to
 * determine where each card is positioned." Before this, the phone cut
 * the photo into nine equal squares and hoped the page filled its
 * outline exactly; a page a little off-centre gave every "pocket" parts
 * of two to four cards. Now:
 *
 * 1. The card outlines are found (OpenCV: edges, then rectangles of a
 *    card's shape).
 * 2. They are fitted to a 3x3 grid, which gives a perspective map from
 *    an ideal flat page to the photo. A tilted, angled or sideways photo
 *    is undone by that map; a pocket whose card was not found (empty, or
 *    hidden by glare) is still placed exactly, from the cards around it.
 * 3. If too few cards agree on a grid, the page's own outline is tried;
 *    if that fails too, the scanner says it is unsure and the player
 *    lines the page up by its corners rather than the scanner guessing.
 * 4. Each pocket is cut from the full-resolution photo through the map,
 *    straightened, with a little border kept, and labelled A1 to C3. The
 *    label is fixed here and never changes after.
 *
 * Nothing is uploaded at a lower quality than the photo has: crops are
 * the photo's own pixels, as JPEG at quality 92.
 */

type Cv = typeof OpenCv;

let ready: Promise<{ cv: Cv }> | null = null;

/**
 * OpenCV, loaded once per server and kept. About 0.2 seconds the first
 * time. Loaded with require, not import: the module presents itself as a
 * promise (it has a `then`), and awaiting an import of it never settles.
 */
export function opencv(): Promise<{ cv: Cv }> {
  ready ??= new Promise<{ cv: Cv }>((resolve, reject) => {
    const load = createRequire(import.meta.url);
    const loaded = load("@techstark/opencv-js") as Cv & {
      then?: (callback: (cv: Cv) => void) => void;
    };
    /* Ready already (a build that is not a promise), or ready when its
       own `then` says so. Called directly, never handed to resolve(),
       which would chase the `then` round in a circle. */
    if ((loaded as unknown as { Mat?: unknown }).Mat) return resolve({ cv: loaded });
    if (typeof loaded.then !== "function")
      return reject(new Error("OpenCV did not load"));
    const timeout = setTimeout(() => reject(new Error("OpenCV did not start")), 15_000);
    loaded.then((cv) => {
      clearTimeout(timeout);
      resolve({ cv });
    });
  });
  return ready;
}

/** How the pockets were found. */
export type DetectMethod = "cards" | "page" | "frame" | "manual";

export interface PocketCrop {
  slot: number;
  /** The card, straightened, as JPEG. */
  jpeg: Uint8Array;
  /** The pocket in the photo, as a share of its width and height (0 to 1). */
  quad: Quad;
  /** A card outline was seen here. */
  cardSeen: boolean;
  /** Looks like an empty pocket: little texture, little edge. */
  looksEmpty: boolean;
  /** A share of the card is blown out by glare. */
  glare: boolean;
}

export interface PageVision {
  method: DetectMethod;
  /** 0 to 1, from how many cards agreed on the grid and how closely. */
  confidence: number;
  /** Below ALIGN_BELOW: the player should line the page up. */
  needsAlignment: boolean;
  /** The page in the photo, as shares of its width and height. */
  page: Quad;
  /** The photo is soft overall: a steadier retake would read better. */
  blurry: boolean;
  /** The upright photo's size in pixels. */
  width: number;
  height: number;
  pockets: PocketCrop[];
  /**
   * The pockets come from the app's guide, not from the cards (a photo cut
   * at the guide whose cards did not settle the grid): cut wider, and each
   * is for the player to check.
   */
  guided: boolean;
}

/** The long side the detector works at. Crops come from the full photo. */
const DETECT_EDGE = 1000;
/** A crop's border beyond the card, as a share of the card's width. */
const CROP_MARGIN = 0.04;
/** Wider when the pockets come from the guide: a card a little off it stays whole. */
const GUIDED_MARGIN = 0.12;
/** The widest a card crop is cut. Wider than any model needs, and no wider. */
const CROP_MAX_WIDTH = 900;

/** Whether a point is inside a convex quad, either way round. */
function inside(p: Point, quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const side = cross > 0 ? 1 : -1;
    if (sign !== 0 && side !== sign) return false;
    sign = side;
  }
  return true;
}

/**
 * sharp, fetched when a photo is actually being read: a top-level import
 * of a native module makes every page that imports this file fail when
 * the binary is missing on the host (src/lib/players/profile.ts says how
 * that once took the site down).
 */
type SharpFactory = (typeof import("sharp"))["default"];

async function loadSharp(): Promise<SharpFactory> {
  try {
    return (await import("sharp")).default;
  } catch (cause) {
    throw new Error(
      "Page reading is unavailable: the sharp native module failed to load.",
      {
        cause,
      },
    );
  }
}

/** The upright photo as RGBA pixels, and its size. */
async function decode(bytes: Uint8Array) {
  const sharp = await loadSharp();
  const { data, info } = await sharp(bytes)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function matFrom(cv: Cv, rgba: Buffer, width: number, height: number): OpenCv.Mat {
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(rgba);
  return mat;
}

/** Card-shaped outlines in a small grey copy of the photo. */
function findCards(cv: Cv, small: OpenCv.Mat): (FoundCard & { sideways: boolean })[] {
  const grey = new cv.Mat();
  const blurred = new cv.Mat();
  const padded = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  /*
   * A black border round the photo first, so a card the photo's edge cuts
   * through still has a closed outline. Builds of the app before this
   * scanner cut the photo exactly at the on-screen guide, and a page that
   * fills the guide has its outer cards cut by it: without the border,
   * those cards had no outline at all and the page was sent back as
   * unreadable.
   */
  const pad = Math.round(Math.max(small.rows, small.cols) * 0.03);
  const back = (p: Point): Point => ({ x: p.x - pad, y: p.y - pad });
  try {
    cv.cvtColor(small, grey, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(grey, blurred, new cv.Size(5, 5), 0);
    cv.copyMakeBorder(
      blurred,
      padded,
      pad,
      pad,
      pad,
      pad,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0),
    );
    cv.Canny(padded, edges, 40, 120);
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const area = small.rows * small.cols;
    const found: (FoundCard & { area: number; sideways: boolean })[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const contourArea = cv.contourArea(contour);
      if (contourArea < area * 0.01 || contourArea > area * 0.2) {
        contour.delete();
        continue;
      }
      const rect = cv.minAreaRect(contour);
      /*
       * The outline's own four corners when it has exactly four: a card
       * photographed at an angle is a trapezoid, and the rotated rectangle
       * around it puts its corners a tenth of a card out, which the page
       * fit then has to absorb.
       */
      const polygon = new cv.Mat();
      cv.approxPolyDP(contour, polygon, cv.arcLength(contour, true) * 0.03, true);
      const four: Point[] | null =
        polygon.rows === 4 && cv.isContourConvex(polygon)
          ? Array.from({ length: 4 }, (_, k) => ({
              x: polygon.data32S[k * 2],
              y: polygon.data32S[k * 2 + 1],
            }))
          : null;
      polygon.delete();
      contour.delete();
      const { width: rw, height: rh } = rect.size;
      const short = Math.min(rw, rh);
      const long = Math.max(rw, rh);
      if (short <= 0) continue;
      const aspect = short / long;
      /* A card is 0.716; perspective and a sleeve's lip move it a little. */
      if (aspect < 0.58 || aspect > 0.86) continue;
      if (contourArea / (rw * rh) < 0.72) continue;
      const corners = boxPoints(rect.center, rw, rh, rect.angle);
      /* The long side, measured from the corners themselves (OpenCV's
         own angle convention has changed between versions): its tilt
         from vertical, -90 to 90. Past 45 the card lies on its side. */
      const e1 = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
      const e2 = { x: corners[2].x - corners[1].x, y: corners[2].y - corners[1].y };
      const longEdge = Math.hypot(e1.x, e1.y) >= Math.hypot(e2.x, e2.y) ? e1 : e2;
      let tilt = (Math.atan2(longEdge.x, longEdge.y) * 180) / Math.PI;
      if (tilt > 90) tilt -= 180;
      if (tilt <= -90) tilt += 180;
      found.push({
        center: back(rect.center),
        corners: (four ?? corners).map(back),
        short,
        long,
        tilt,
        sideways: Math.abs(tilt) > 45,
        area: short * long,
      });
    }
    /* One outline per card: a sleeve, the card and its art box are
       nested; the largest whose centre is not already inside a kept one
       wins. */
    found.sort((a, b) => b.area - a.area);
    const kept: (FoundCard & { area: number; sideways: boolean })[] = [];
    for (const card of found) {
      const inside = kept.some(
        (k) =>
          Math.abs(k.center.x - card.center.x) < k.short / 2 &&
          Math.abs(k.center.y - card.center.y) < k.long / 2,
      );
      if (!inside) kept.push(card);
    }
    return kept.map(({ center, corners, short, long, tilt, sideways }) => ({
      center,
      corners,
      short,
      long,
      tilt,
      sideways,
    }));
  } finally {
    grey.delete();
    blurred.delete();
    padded.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function boxPoints(
  center: Point,
  width: number,
  height: number,
  angleDeg: number,
): Point[] {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([dx, dy]) => ({
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }));
}

/** The page's own outline: the largest four-cornered shape, when it is big. */
function findPageOutline(cv: Cv, small: OpenCv.Mat): Quad | null {
  const grey = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.cvtColor(small, grey, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(grey, grey, new cv.Size(7, 7), 0);
    cv.Canny(grey, edges, 30, 90);
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );
    let best: Quad | null = null;
    let bestArea = small.rows * small.cols * 0.3;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, cv.arcLength(contour, true) * 0.02, true);
      const contourArea = cv.contourArea(approx);
      if (approx.rows === 4 && contourArea > bestArea) {
        const points: Point[] = [];
        for (let k = 0; k < 4; k++) {
          points.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        }
        best = orderCorners(points);
        bestArea = contourArea;
      }
      approx.delete();
      contour.delete();
    }
    return best;
  } finally {
    grey.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/** The page's sharpness: the variance of its Laplacian. */
function sharpness(cv: Cv, small: OpenCv.Mat): number {
  const grey = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const std = new cv.Mat();
  try {
    cv.cvtColor(small, grey, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(grey, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, std);
    return std.data64F[0] ** 2;
  } finally {
    grey.delete();
    lap.delete();
    mean.delete();
    std.delete();
  }
}

/** Texture, edges and glare in a cut card. */
function pocketLooks(cv: Cv, crop: OpenCv.Mat): { empty: boolean; glare: boolean } {
  const grey = new cv.Mat();
  const edges = new cv.Mat();
  const mean = new cv.Mat();
  const std = new cv.Mat();
  const hsv = new cv.Mat();
  const rgb = new cv.Mat();
  try {
    /* The middle of the pocket only: its border is sleeve and neighbour. */
    const inset = new cv.Rect(
      Math.round(crop.cols * 0.12),
      Math.round(crop.rows * 0.12),
      Math.round(crop.cols * 0.76),
      Math.round(crop.rows * 0.76),
    );
    const middle = crop.roi(inset);
    cv.cvtColor(middle, grey, cv.COLOR_RGBA2GRAY);
    cv.meanStdDev(grey, mean, std);
    cv.Canny(grey, edges, 50, 150);
    const edgeShare = cv.countNonZero(edges) / (edges.rows * edges.cols);
    cv.cvtColor(middle, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    let blown = 0;
    const pixels = hsv.rows * hsv.cols;
    for (let i = 0; i < pixels; i += 4) {
      const s = hsv.data[i * 3 + 1];
      const v = hsv.data[i * 3 + 2];
      if (v > 240 && s < 30) blown += 1;
    }
    middle.delete();
    return {
      empty: edgeShare < 0.02 && std.data64F[0] < 16,
      glare: blown / (pixels / 4) > 0.08,
    };
  } finally {
    grey.delete();
    edges.delete();
    mean.delete();
    std.delete();
    hsv.delete();
    rgb.delete();
  }
}

/** The photo's pixels inside `quad`, straightened to a `w` by `h` card. */
function cut(cv: Cv, full: OpenCv.Mat, quad: Quad, w: number, h: number): OpenCv.Mat {
  const src = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    quad.flatMap((p) => [p.x, p.y]),
  );
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const transform = cv.getPerspectiveTransform(src, dst);
  const out = new cv.Mat();
  cv.warpPerspective(
    full,
    out,
    transform,
    new cv.Size(w, h),
    cv.INTER_CUBIC,
    cv.BORDER_REPLICATE,
  );
  src.delete();
  dst.delete();
  transform.delete();
  return out;
}

async function jpeg(cv: Cv, mat: OpenCv.Mat): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const bytes = await sharp(Buffer.from(mat.data), {
    raw: { width: mat.cols, height: mat.rows, channels: 4 },
  })
    .removeAlpha()
    .jpeg({ quality: 92 })
    .toBuffer();
  return new Uint8Array(bytes);
}

/**
 * Finds the page and its nine pockets and cuts each one out.
 *
 * `corners`, when given, are the player's own four corners of the page
 * (as shares of the photo's width and height): the pockets are cut from
 * those, and the detector's guess is not used.
 */
export async function readPagePhoto(
  bytes: Uint8Array,
  corners?: Quad,
  /**
   * The photo was already cut at the app's on-screen guide (builds before
   * this scanner): its edges are where the player put the page's edges.
   * Those builds have no screen for lining a page up, so when the cards
   * do not settle the grid, the guide does, as the scanner before this
   * one always assumed, rather than the page coming back unreadable.
   */
  options: { framed?: boolean } = {},
): Promise<PageVision> {
  const { cv } = await opencv();
  const { data, width, height } = await decode(bytes);
  const full = matFrom(cv, data, width, height);
  const scale = DETECT_EDGE / Math.max(width, height);
  const small = new cv.Mat();
  cv.resize(
    full,
    small,
    new cv.Size(Math.round(width * scale), Math.round(height * scale)),
    0,
    0,
    cv.INTER_AREA,
  );

  try {
    let method: DetectMethod;
    let homography: Homography | null = null;
    let gaps: GridGaps = DEFAULT_GAPS;
    let guided = false;
    let confidence: number;
    const seen = new Set<number>();
    /* Card outlines found, centres in the full photo's pixels. */
    let centres: Point[] = [];
    const toFull = (p: Point): Point => ({ x: p.x / scale, y: p.y / scale });

    if (corners) {
      method = "manual";
      const page = corners.map((p) => ({ x: p.x * width, y: p.y * height }));
      homography = fitHomography(idealPage(gaps), page);
      confidence = 1;
    } else {
      const cards = findCards(cv, small);
      /*
       * Most cards on their side: the page was photographed turned a
       * quarter. Whether clockwise or not cannot be told from outlines,
       * and guessing would put A1 where C3 is, so the player is asked to
       * line the page up (and turn it) instead.
       */
      const sideways = cards.filter((card) => card.sideways).length > cards.length / 2;
      const fit = sideways
        ? null
        : fitGrid(
            cards.map((card) => ({
              center: card.center,
              corners: card.corners,
              short: card.short,
              long: card.long,
              /* Upright cards: tilt folded into -45 to 45. */
              tilt:
                card.tilt > 45
                  ? card.tilt - 90
                  : card.tilt < -45
                    ? card.tilt + 90
                    : card.tilt,
            })),
            { width: small.cols, height: small.rows },
          );
      if (sideways) {
        method = "frame";
        homography = fitHomography(idealPage(gaps), [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ]);
        confidence = 0.2;
      } else if (fit) {
        method = "cards";
        gaps = fit.gaps;
        /* Fitted on the small copy: scale the map up to the full photo. */
        const s = 1 / scale;
        homography = [
          fit.homography[0] * s,
          fit.homography[1] * s,
          fit.homography[2] * s,
          fit.homography[3] * s,
          fit.homography[4] * s,
          fit.homography[5] * s,
          fit.homography[6],
          fit.homography[7],
          fit.homography[8],
        ];
        centres = cards.map((card) => toFull(card.center));
        /* Another placing fits as well: the player lines it up, never a guess. */
        confidence = fit.ambiguous
          ? Math.min(gridConfidence(fit), 0.5)
          : gridConfidence(fit);
      } else {
        const outline = findPageOutline(cv, small);
        if (outline) {
          method = "page";
          homography = fitHomography(idealPage(gaps), outline.map(toFull));
          confidence = 0.55;
        } else {
          method = "frame";
          homography = fitHomography(idealPage(gaps), [
            { x: 0, y: 0 },
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ]);
          confidence = 0.3;
        }
      }
      if (options.framed && !sideways && confidence < ALIGN_BELOW) {
        if (fit && fit.ambiguous && gridConfidence(fit) >= ALIGN_BELOW) {
          /* The cards fit more than one way; the guide says which is centred. */
          confidence = gridConfidence(fit);
        } else {
          method = "frame";
          gaps = DEFAULT_GAPS;
          homography = fitHomography(idealPage(gaps), [
            { x: 0, y: 0 },
            { x: width, y: 0 },
            { x: width, y: height },
            { x: 0, y: height },
          ]);
          centres = cards.map((card) => toFull(card.center));
          confidence = ALIGN_BELOW;
          guided = true;
        }
      }
    }
    if (!homography) throw new Error("No page map");

    const blurry = sharpness(cv, small) < 40;
    const share = (q: Quad): Quad =>
      q.map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
    const margin = guided ? GUIDED_MARGIN : CROP_MARGIN;
    const pocketQuads = Array.from({ length: 9 }, (_, slot) =>
      mapQuad(homography as Homography, idealCard(slot, gaps, margin)),
    );
    /* Crop size from the pocket's own size in the photo, never upscaled. */
    const pocketWidth = Math.min(
      CROP_MAX_WIDTH,
      Math.round(
        Math.max(
          ...pocketQuads.map((q) => Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y)),
        ),
      ),
    );
    const w = Math.max(240, pocketWidth);
    const h = Math.round(w * ((CARD_RATIO + 2 * margin) / (1 + 2 * margin)));

    /*
     * Which pockets hold a found outline: the outline's centre inside the
     * very pocket the crop is cut from, so the flag can never disagree
     * with the picture (a fitted slot label could, by one pocket, when a
     * row had a gap in it).
     */
    for (const centre of centres) {
      const slot = pocketQuads.findIndex((quad) => inside(centre, quad));
      if (slot >= 0) seen.add(slot);
    }

    const pockets: PocketCrop[] = [];
    for (let slot = 0; slot < 9; slot++) {
      const quad = pocketQuads[slot];
      const crop = cut(cv, full, quad, w, h);
      const looks = pocketLooks(cv, crop);
      pockets.push({
        slot,
        jpeg: await jpeg(cv, crop),
        quad: share(quad),
        cardSeen: seen.has(slot),
        /* A pocket a card outline was found in is never called empty. */
        looksEmpty: !seen.has(slot) && looks.empty,
        glare: looks.glare,
      });
      crop.delete();
    }

    return {
      method,
      confidence,
      needsAlignment: confidence < ALIGN_BELOW,
      page: share(mapQuad(homography, idealPage(gaps))),
      blurry,
      width,
      height,
      pockets,
      guided,
    };
  } finally {
    full.delete();
    small.delete();
  }
}
