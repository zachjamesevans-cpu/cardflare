/**
 * Lining a binder page up by hand, as arithmetic: whether four corners
 * make a page, which corner is A1's, and where a corner sits on screen.
 * Kept free of imports so tests/unit/page-align-app.test.ts runs it in
 * node.
 *
 * `cornersMakeAPage` is the website's own rule (src/lib/cards/
 * page-geometry.ts), word for word: the app cannot import from the
 * website, so it carries a copy, and the test fails if the two copies
 * disagree. The server checks the same rule again before it reads.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four corners: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

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

/**
 * "Turn": A1 moves to the next corner round, clockwise. The corners stay
 * where they are on the photo; only which one the page is read from
 * changes, so four turns are where it started.
 */
export function turnCorners(corners: Quad): Quad {
  return [corners[1], corners[2], corners[3], corners[0]];
}

/** The photo as drawn in a box, `contain`: its size on screen and where it starts. */
export function containFit(
  box: { width: number; height: number },
  photo: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(
    box.width / Math.max(1, photo.width),
    box.height / Math.max(1, photo.height),
  );
  const width = photo.width * scale;
  const height = photo.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * A corner dragged by (dx, dy) screen points, from where it was when the
 * finger came down, on a photo drawn `drawn` big: kept on the photo.
 */
export function dragCorner(
  from: Point,
  dx: number,
  dy: number,
  drawn: { width: number; height: number },
): Point {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp(from.x + dx / Math.max(1, drawn.width)),
    y: clamp(from.y + dy / Math.max(1, drawn.height)),
  };
}
