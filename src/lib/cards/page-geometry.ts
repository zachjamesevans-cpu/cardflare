/**
 * The geometry of a binder page: pure arithmetic, no images, no server.
 *
 * The founder (2026-10-13): "Do not rely on the language model to
 * determine where each card is positioned." The model is shown one card
 * at a time; where that card sits is decided here, from the outlines the
 * page detector found (page-vision.ts), and it never changes after.
 *
 * Pockets are named the way the founder asked:
 *
 *   A1 | A2 | A3
 *   B1 | B2 | B3
 *   C1 | C2 | C3
 *
 * Slot 0 is A1 and slot 8 is C3; the binder's own pocket numbers (page 1
 * is 0 to 8) follow the same order, so A1 on the photo is A1 on the page.
 *
 * Kept free of imports so every rule here is unit-tested directly.
 */

export const SLOT_NAMES = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

/** "A1" for slot 0, "C3" for slot 8. */
export function slotName(slot: number): SlotName {
  return SLOT_NAMES[slot];
}

/** A trading card is 63 by 88 millimetres, the same in every game we carry. */
export const CARD_RATIO = 88 / 63;

export interface Point {
  x: number;
  y: number;
}

/** Four corners: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

/** Any four corners, put in the order above (by position, not by input order). */
export function orderCorners(points: readonly Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

/**
 * The gaps between pockets, in card widths (horizontal) and card widths
 * (vertical too, so one unit runs both ways). Binders differ: a tight
 * nine-pocket page has gaps near 0.05, a padded one near 0.15.
 */
export interface GridGaps {
  x: number;
  y: number;
}

export const DEFAULT_GAPS: GridGaps = { x: 0.06, y: 0.06 };

/**
 * A pocket's card on the ideal page: card width 1, height CARD_RATIO,
 * columns and rows apart by the gaps. `margin` grows it a little on every
 * side (as a share of the card's width) so a crop keeps the card's edges.
 */
export function idealCard(slot: number, gaps: GridGaps, margin = 0): Quad {
  const row = Math.floor(slot / 3);
  const col = slot % 3;
  const left = col * (1 + gaps.x) - margin;
  const top = row * (CARD_RATIO + gaps.y) - margin;
  const right = col * (1 + gaps.x) + 1 + margin;
  const bottom = row * (CARD_RATIO + gaps.y) + CARD_RATIO + margin;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/** The ideal page: the nine pockets and half a gap around them. */
export function idealPage(gaps: GridGaps): Quad {
  const left = -gaps.x / 2;
  const top = -gaps.y / 2;
  const right = 3 * (1 + gaps.x) - gaps.x / 2;
  const bottom = 3 * (CARD_RATIO + gaps.y) - gaps.y / 2;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * Whether four corners make a page: inside the photo (give or take), in
 * clockwise order as the photo shows them, convex, and of some size. The
 * order is the player's: the first corner is the page's top left as it is
 * read (A1's corner), so a page photographed on its side is turned by
 * starting from another corner. Mirrored or crossed corners are a slip.
 */
export function cornersMakeAPage(corners: Quad): boolean {
  if (corners.some((p) => p.x < -0.25 || p.x > 1.25 || p.y < -0.25 || p.y > 1.25)) {
    return false;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = corners[(i + 2) % 4];
    area += a.x * b.y - b.x * a.y;
    /* Each turn the same way round: a convex page, not a bow tie. */
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return false;
  }
  return area / 2 >= 0.05;
}

/* ---- Homographies --------------------------------------------------- */

/** A 3x3 projective map, row by row, with the last entry 1. */
export type Homography = number[];

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

export function mapQuad(h: Homography, quad: Quad): Quad {
  return quad.map((p) => applyHomography(h, p)) as Quad;
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * The projective map taking each `from` point to its `to` point, by least
 * squares when there are more than four pairs. Null when they do not pin
 * one down (fewer than four, or all in a line).
 */
export function fitHomography(
  from: readonly Point[],
  to: readonly Point[],
): Homography | null {
  if (from.length < 4 || from.length !== to.length) return null;
  /* Normalised first: card units and pixels differ by three orders of
     magnitude, and least squares on raw pixels loses the small terms. */
  const norm = (points: readonly Point[]) => {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const spread =
      points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length ||
      1;
    const k = Math.SQRT2 / spread;
    return {
      cx,
      cy,
      k,
      points: points.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k })),
    };
  };
  const a = norm(from);
  const b = norm(to);

  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const add = (row: number[], value: number) => {
    for (let i = 0; i < 8; i++) {
      atb[i] += row[i] * value;
      for (let j = 0; j < 8; j++) ata[i][j] += row[i] * row[j];
    }
  };
  a.points.forEach((p, i) => {
    const q = b.points[i];
    add([p.x, p.y, 1, 0, 0, 0, -q.x * p.x, -q.x * p.y], q.x);
    add([0, 0, 0, p.x, p.y, 1, -q.y * p.x, -q.y * p.y], q.y);
  });
  const x = solve(ata, atb);
  if (!x) return null;
  const hn = [...x, 1];

  /* Undo the normalisation: H = Tb^-1 * Hn * Ta. */
  const ta = [a.k, 0, -a.k * a.cx, 0, a.k, -a.k * a.cy, 0, 0, 1];
  const tbInv = [1 / b.k, 0, b.cx, 0, 1 / b.k, b.cy, 0, 0, 1];
  const mul = (p: number[], q: number[]) =>
    Array.from({ length: 9 }, (_, i) => {
      const r = Math.floor(i / 3);
      const c = i % 3;
      return p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c];
    });
  const h = mul(tbInv, mul(hn, ta));
  if (!h.every(Number.isFinite) || Math.abs(h[8]) < 1e-12) return null;
  return h.map((v) => v / h[8]);
}

/* ---- Finding the grid in the cards the detector saw ------------------ */

/** One card outline found in the photo, as a rotated rectangle. */
export interface FoundCard {
  center: Point;
  /** Its corners in the photo, any order. */
  corners: Point[];
  /** The short side and the long side, in pixels. */
  short: number;
  long: number;
  /** Degrees, the long side's tilt from vertical, -45 to 45. */
  tilt: number;
}

export interface GridFit {
  /** Ideal page units to photo pixels. */
  homography: Homography;
  gaps: GridGaps;
  /** Which found card sits in which slot. */
  placed: { slot: number; card: number }[];
  /** Mean distance of the found corners from where the fit puts them, in card widths. */
  error: number;
  /** Another placing of the grid explains the photo as well: ask, do not guess. */
  ambiguous?: boolean;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
};

/** The affine map taking `from` to `to`, by least squares. Steadier than a projective one from a single card. */
function fitAffine(from: readonly Point[], to: readonly Point[]): Homography | null {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  from.forEach((p, k) => {
    const row = [p.x, p.y, 1];
    for (let i = 0; i < 3; i++) {
      bx[i] += row[i] * to[k].x;
      by[i] += row[i] * to[k].y;
      for (let j = 0; j < 3; j++) ata[i][j] += row[i] * row[j];
    }
  });
  const x = solve(ata, bx);
  const y = solve(ata, by);
  return x && y ? [x[0], x[1], x[2], y[0], y[1], y[2], 0, 0, 1] : null;
}

const centreOf = (quad: Quad): Point => ({
  x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
  y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
});

/**
 * Which found card sits in which slot, if the grid is where `h` says: each
 * card to the slot whose centre it is nearest, within `reach` of its own
 * width, one card a slot. Nearest pairs first.
 */
function assign(
  h: Homography,
  gaps: GridGaps,
  centres: readonly Point[],
  widths: readonly number[],
  reach: number,
): { slot: number; card: number; distance: number }[] {
  const slots = Array.from({ length: 9 }, (_, slot) =>
    applyHomography(h, centreOf(idealCard(slot, gaps))),
  );
  const pairs: { slot: number; card: number; distance: number }[] = [];
  centres.forEach((c, card) => {
    slots.forEach((p, slot) => {
      const distance = Math.hypot(p.x - c.x, p.y - c.y) / widths[card];
      if (distance < reach) pairs.push({ slot, card, distance });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance);
  const usedSlot = new Set<number>();
  const usedCard = new Set<number>();
  const out: { slot: number; card: number; distance: number }[] = [];
  for (const pair of pairs) {
    if (usedSlot.has(pair.slot) || usedCard.has(pair.card)) continue;
    usedSlot.add(pair.slot);
    usedCard.add(pair.card);
    out.push(pair);
  }
  return out;
}

/**
 * The whole-page fit for one placing: every placed card's corners, the
 * gaps that fit them best. Then once more without any card whose corners
 * the rest disagree with (an art box taken for the card's edge, a sleeve's
 * lip): it still sits in its pocket, it just does not steer the grid.
 */
function refine(
  placed: readonly { slot: number; card: number }[],
  ordered: readonly Quad[],
  width: number,
  fixed: { x: number | null; y: number | null },
): { homography: Homography; gaps: GridGaps; error: number } | null {
  const first = refineOnce(placed, ordered, width, fixed);
  if (!first || placed.length <= 4) return first;
  const residual = placed.map(({ slot, card }) => {
    const ideal = idealCard(slot, first.gaps);
    return (
      ideal.reduce((sum, p, k) => {
        const q = applyHomography(first.homography, p);
        return sum + Math.hypot(q.x - ordered[card][k].x, q.y - ordered[card][k].y);
      }, 0) /
      4 /
      width
    );
  });
  const typical = median(residual);
  const steady = placed.filter((_, i) => residual[i] <= Math.max(0.04, typical * 2.5));
  if (steady.length === placed.length || steady.length < 3) return first;
  return refineOnce(steady, ordered, width, fixed) ?? first;
}

function refineOnce(
  placed: readonly { slot: number; card: number }[],
  ordered: readonly Quad[],
  width: number,
  fixed: { x: number | null; y: number | null },
): { homography: Homography; gaps: GridGaps; error: number } | null {
  let best: { homography: Homography; gaps: GridGaps; error: number } | null = null;
  const steps = Array.from({ length: 21 }, (_, i) => i * 0.02);
  for (const gx of fixed.x === null ? steps : [fixed.x]) {
    for (const gy of fixed.y === null ? steps : [fixed.y]) {
      const gaps = { x: gx, y: gy };
      const from: Point[] = [];
      const to: Point[] = [];
      for (const { slot, card } of placed) {
        idealCard(slot, gaps).forEach((p, k) => {
          from.push(p);
          to.push(ordered[card][k]);
        });
      }
      const homography = fitHomography(from, to);
      if (!homography) continue;
      const errors = from.map((p, i) => {
        const q = applyHomography(homography, p);
        return Math.hypot(q.x - to[i].x, q.y - to[i].y);
      });
      const error = median(errors) / width;
      if (!best || error < best.error) best = { homography, gaps, error };
    }
  }
  return best;
}

/**
 * The 3x3 grid, from the card outlines found.
 *
 * Every outline proposes a placing: "I am pocket A1", "I am B2", and so on
 * for all nine. Its own four corners then say where every other pocket
 * would be, and the placing that puts the most other outlines in a pocket
 * wins. The winner is then fitted to every corner it placed at once
 * (perspective and the binder's own gaps included).
 *
 * When two different placings explain the photo equally well (a page
 * whose cards only fill two of its columns, say, so the grid could sit
 * one column either way) the one centred in the photo is taken, and the
 * fit says `ambiguous` unless that choice is clear: the player is asked
 * to line the page up rather than the scanner guessing. The row-by-row
 * fit this replaced put a card one pocket over, confidently, on a page in
 * perspective with a gap in every row.
 */
export function fitGrid(
  cards: readonly FoundCard[],
  image: { width: number; height: number },
): GridFit | null {
  if (cards.length < 3) return null;
  const tilt = (median(cards.map((c) => c.tilt)) * Math.PI) / 180;
  const cos = Math.cos(-tilt);
  const sin = Math.sin(-tilt);
  const cx = image.width / 2;
  const cy = image.height / 2;
  const level = (p: Point): Point => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  });

  /* Each card's corners as top left, top right, bottom right, bottom left of the page. */
  const ordered = cards.map((card) => {
    const levelled = card.corners.map(level);
    return orderCorners(levelled).map((q) => card.corners[levelled.indexOf(q)]) as Quad;
  });
  const widths = cards.map((c) => c.short);
  const centres = cards.map((c) => c.center);
  const w = median(widths);
  if (w <= 0) return null;

  /* The pitch, in card sizes, from neighbours in a row or a column. */
  const flat = cards.map((c) => level(c.center));
  const ratiosX: number[] = [];
  const ratiosY: number[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const dx = Math.abs(flat[j].x - flat[i].x);
      const dy = Math.abs(flat[j].y - flat[i].y);
      const cw = (cards[i].short + cards[j].short) / 2;
      const ch = (cards[i].long + cards[j].long) / 2;
      if (dy < 0.35 * ch) {
        const r = dx / cw;
        if (r >= 0.95 && r < 1.6) ratiosX.push(r);
        else if (r >= 1.9 && r < 3.2) ratiosX.push(r / 2);
      }
      if (dx < 0.35 * cw) {
        const r = dy / ch;
        if (r >= 0.95 && r < 1.6) ratiosY.push(r);
        else if (r >= 1.9 && r < 3.2) ratiosY.push(r / 2);
      }
    }
  }
  const measuredX =
    ratiosX.length > 0 ? Math.min(0.4, Math.max(0, median(ratiosX) - 1)) : null;
  const measuredY =
    ratiosY.length > 0
      ? Math.min(0.4, Math.max(0, (median(ratiosY) - 1) * CARD_RATIO))
      : null;
  /* A gap nothing measured borrows the other way's: pages are near even. */
  const guess: GridGaps = {
    x: measuredX ?? measuredY ?? DEFAULT_GAPS.x,
    y: measuredY ?? measuredX ?? DEFAULT_GAPS.y,
  };
  /* Held where it is in the fit: no two cards side by side (or one above
     another) means the corners cannot say, and the fit would wander. */
  const fixed = {
    x: measuredX === null ? guess.x : null,
    y: measuredY === null ? guess.y : null,
  };

  /* Every outline, every pocket it could be. */
  const REACH = 0.42;
  /*
   * Kept: every placing within one card of the best. One card's corners
   * are a rough guide to pockets two away under strong perspective, so
   * the right placing can come up one short here and win once refined.
   */
  const proposals = new Map<string, { slot: number; card: number }[]>();
  for (let card = 0; card < cards.length; card++) {
    for (let slot = 0; slot < 9; slot++) {
      const h = fitAffine(idealCard(slot, guess), ordered[card]);
      if (!h) continue;
      const placed = assign(h, guess, centres, widths, REACH);
      if (!placed.some((p) => p.card === card && p.slot === slot)) continue;
      const key = slotsOf({ placed });
      if (!proposals.has(key)) proposals.set(key, placed);
    }
  }
  const bestCount = Math.max(0, ...[...proposals.values()].map((p) => p.length));
  if (bestCount < 3) return null;
  const placings = [...proposals.values()].filter((p) => p.length >= bestCount - 1);

  /* Each placing that explained as many cards, fitted whole and refined once. */
  const fits = placings.flatMap((placed) => {
    const first = refine(placed, ordered, w, fixed);
    if (!first) return [];
    const again = assign(first.homography, first.gaps, centres, widths, REACH);
    const final =
      again.length >= placed.length ? refine(again, ordered, w, fixed) : first;
    if (!final) return [];
    const used = again.length >= placed.length ? again : placed;
    const middle = applyHomography(final.homography, centreOf(idealPage(final.gaps)));
    return [
      {
        ...final,
        placed: used.map(({ slot, card }) => ({ slot, card })),
        offCentre: Math.hypot(middle.x - cx, middle.y - cy),
      },
    ];
  });
  if (fits.length === 0) return null;
  /* Most cards placed, then the tighter fit when it is clearly tighter, else the more centred. */
  fits.sort(
    (a, b) =>
      b.placed.length - a.placed.length ||
      (Math.abs(a.error - b.error) >= 0.02
        ? a.error - b.error
        : a.offCentre - b.offCentre),
  );
  const best = fits[0];
  const rivals = fits.filter(
    (fit) =>
      fit.placed.length === best.placed.length &&
      fit.error < best.error + 0.03 &&
      slotsOf(fit) !== slotsOf(best),
  );
  /* A rival placing as good, and the centring no clear tie-break. */
  const ambiguous = rivals.some((fit) => fit.offCentre - best.offCentre < w * 0.5);
  return {
    homography: best.homography,
    gaps: best.gaps,
    placed: best.placed,
    error: best.error,
    ambiguous,
  };
}

const slotsOf = (fit: { placed: { slot: number; card: number }[] }) =>
  fit.placed
    .map((p) => `${p.card}:${p.slot}`)
    .sort()
    .join(",");

/**
 * How sure the detector is of where the pockets are, from what it saw:
 * more cards agreeing on one grid, and a closer fit, is surer. Below
 * ALIGN_BELOW the player is asked to line the page up rather than the
 * scanner guessing.
 */
export function gridConfidence(fit: Pick<GridFit, "placed" | "error"> | null): number {
  if (!fit) return 0;
  /* A loose fit is a grid the cards do not agree on: line it up by hand. */
  if (fit.error > LOOSE_FIT) return 0.5;
  const coverage = Math.min(1, fit.placed.length / 6);
  const tightness = Math.max(0, 1 - fit.error / 0.08);
  return Math.round((0.35 + 0.4 * coverage + 0.25 * tightness) * 100) / 100;
}

export const ALIGN_BELOW = 0.6;
/** Past this median corner error, in card widths, the grid is not trusted. */
export const LOOSE_FIT = 0.05;
