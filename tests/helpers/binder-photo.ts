import sharp from "sharp";

import { opencv } from "@/lib/cards/page-vision";

/**
 * Synthetic binder-page photos for the scanner's tests: nine pockets on a
 * black page, each card a distinct colour with an art box, a name bar and
 * text lines (the edges a real card has), on a wooden table. The tests
 * then tilt it, angle it and add glare, and check every card comes back
 * in its own pocket. No real card art, and no network.
 */

/** A distinct colour per slot, A1 to C3, as [r, g, b]. */
export const SLOT_COLOURS: [number, number, number][] = [
  [220, 40, 40],
  [40, 160, 60],
  [40, 80, 220],
  [230, 200, 30],
  [170, 60, 200],
  [30, 190, 200],
  [240, 120, 20],
  [120, 120, 120],
  [250, 120, 170],
];

const hex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export interface PageOptions {
  /** Slots left empty. */
  empty?: number[];
  /** Slots under a patch of glare. */
  glare?: number[];
  /** Degrees to turn the whole photo. */
  rotate?: number;
  /** Corner offsets for a perspective tilt, as shares of the page width. */
  skew?: number;
}

const CARD_W = 360;
const CARD_H = 502;
const GAP = 28;
const PAD = 40;
export const PAGE_W = PAD * 2 + CARD_W * 3 + GAP * 2;
export const PAGE_H = PAD * 2 + CARD_H * 3 + GAP * 2;

function cardSvg(slot: number, x: number, y: number): string {
  const colour = hex(SLOT_COLOURS[slot]);
  const lines = Array.from(
    { length: 4 },
    (_, i) =>
      `<rect x="${x + 40}" y="${y + 380 + i * 22}" width="${200 + ((slot * 37 + i * 53) % 80)}" height="8" fill="#222"/>`,
  ).join("");
  return `
    <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="#f4f1e8"/>
    <rect x="${x + 14}" y="${y + 14}" width="${CARD_W - 28}" height="${CARD_H - 28}" rx="8" fill="${colour}"/>
    <rect x="${x + 30}" y="${y + 60}" width="${CARD_W - 60}" height="270" fill="${colour}" stroke="#111" stroke-width="4"/>
    <circle cx="${x + CARD_W / 2}" cy="${y + 195}" r="70" fill="#fff" fill-opacity="0.55"/>
    <rect x="${x + 30}" y="${y + 24}" width="${CARD_W - 60}" height="26" fill="#111" fill-opacity="0.75"/>
    <rect x="${x + 30}" y="${y + 345}" width="${CARD_W - 60}" height="22" fill="#111" fill-opacity="0.7"/>
    ${lines}`;
}

/** The flat page, as PNG. */
export async function flatPage(options: PageOptions = {}): Promise<Buffer> {
  const empty = new Set(options.empty ?? []);
  const glare = new Set(options.glare ?? []);
  let body = `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#151515"/>`;
  for (let slot = 0; slot < 9; slot++) {
    const x = PAD + (slot % 3) * (CARD_W + GAP);
    const y = PAD + Math.floor(slot / 3) * (CARD_H + GAP);
    /* The pocket's sleeve edge, faint, on every pocket. */
    body += `<rect x="${x - 6}" y="${y - 6}" width="${CARD_W + 12}" height="${CARD_H + 12}" rx="10" fill="none" stroke="#2a2a2a" stroke-width="3"/>`;
    if (!empty.has(slot)) body += cardSvg(slot, x, y);
    if (glare.has(slot)) {
      body += `<ellipse cx="${x + CARD_W * 0.6}" cy="${y + CARD_H * 0.35}" rx="120" ry="80" fill="#fff" fill-opacity="0.92"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">${body}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The page photographed on a table: turned by `rotate` degrees, and with
 * `skew` pulling the top corners in, as a phone held at an angle sees
 * it (a true perspective, through OpenCV). Returns a JPEG, as a phone
 * sends.
 */
export async function photographed(options: PageOptions = {}): Promise<Uint8Array> {
  const page = await flatPage(options);
  const table = { r: 176, g: 138, b: 90, alpha: 1 };
  const framed = await sharp(page)
    .extend({ top: 120, bottom: 120, left: 120, right: 120, background: table })
    .png()
    .toBuffer();
  let shaped = framed;
  const skew = options.skew ?? 0;
  if (skew) {
    const { cv } = await opencv();
    const { data, info } = await sharp(framed)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const src = new cv.Mat(info.height, info.width, cv.CV_8UC4);
    src.data.set(data);
    const w = info.width;
    const h = info.height;
    const pull = skew * w;
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const to = cv.matFromArray(4, 1, cv.CV_32FC2, [pull, 0, w - pull, 0, w, h, 0, h]);
    const m = cv.getPerspectiveTransform(from, to);
    const out = new cv.Mat();
    cv.warpPerspective(
      src,
      out,
      m,
      new cv.Size(w, h),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(176, 138, 90, 255),
    );
    shaped = await sharp(Buffer.from(out.data), {
      raw: { width: w, height: h, channels: 4 },
    })
      .png()
      .toBuffer();
    [src, from, to, m, out].forEach((mat) => mat.delete());
  }
  const turned = options.rotate
    ? await sharp(shaped).rotate(options.rotate, { background: table }).png().toBuffer()
    : shaped;
  return new Uint8Array(await sharp(turned).jpeg({ quality: 88 }).toBuffer());
}

/** The mean colour of a crop's middle, as [r, g, b]. */
export async function middleColour(
  jpeg: Uint8Array,
): Promise<[number, number, number]> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  /* Inside the art box, below-left of its circle: only the card's colour. */
  for (let y = Math.round(info.height * 0.55); y < info.height * 0.61; y++) {
    for (let x = Math.round(info.width * 0.18); x < info.width * 0.26; x++) {
      const i = (y * info.width + x) * ch;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

/** The slot whose colour is nearest, or null when nothing is close. */
export function nearestSlot([r, g, b]: [number, number, number]): number | null {
  let best: number | null = null;
  let bestDistance = 70;
  SLOT_COLOURS.forEach(([sr, sg, sb], slot) => {
    const d = Math.hypot(r - sr, g - sg, b - sb);
    if (d < bestDistance) {
      bestDistance = d;
      best = slot;
    }
  });
  return best;
}
