import { SCAN_LONG_EDGE } from "./scan-copy";

/**
 * Where the card scanner's guide frame sits, and which part of the
 * photo that is. Pure arithmetic, so tests/unit/card-scan-app.test.ts
 * can check it without a camera.
 *
 * The photo the camera takes is bigger than the preview and not the
 * same shape: the preview fills its box the way `cover` does, cut at
 * the long sides. So the frame drawn on screen is carried back through
 * that same fit into the photo's own pixels, and only that region goes
 * up, at SCAN_LONG_EDGE on its long side: the website's size, so both
 * platforms send the reader the same picture.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A card's shape, width over height: 2.5 by 3.5 inches. */
export const CARD_ASPECT = 2.5 / 3.5;

/**
 * Room kept round the frame when cropping, as a share of its size. A
 * card held a little loose still keeps its bottom edge, which is where
 * the collector number is printed.
 */
export const FRAME_MARGIN = 0.06;

/** The guide frame, card-shaped and centred, as large as the preview allows. */
export function guideFrame(viewWidth: number, viewHeight: number): Box {
  const width = Math.min(viewWidth * 0.78, viewHeight * 0.82 * CARD_ASPECT);
  const height = width / CARD_ASPECT;
  return {
    x: (viewWidth - width) / 2,
    y: (viewHeight - height) / 2,
    width,
    height,
  };
}

/**
 * The frame in the photo's pixels, for the image manipulator: through
 * the preview's cover fit, widened by FRAME_MARGIN, kept inside the
 * photo. A whole page is cut at its guide exactly (margin 0): each
 * pocket is widened on its own, by POCKET_MARGIN.
 */
export function frameInPhoto(
  frame: Box,
  view: { width: number; height: number },
  photo: { width: number; height: number },
  margin = FRAME_MARGIN,
): { originX: number; originY: number; width: number; height: number } {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const offsetX = (photo.width * scale - view.width) / 2;
  const offsetY = (photo.height * scale - view.height) / 2;

  const padX = frame.width * margin;
  const padY = frame.height * margin;
  const left = Math.max(0, (frame.x - padX + offsetX) / scale);
  const top = Math.max(0, (frame.y - padY + offsetY) / scale);
  const right = Math.min(photo.width, (frame.x + frame.width + padX + offsetX) / scale);
  const bottom = Math.min(
    photo.height,
    (frame.y + frame.height + padY + offsetY) / scale,
  );

  const originX = Math.round(left);
  const originY = Math.round(top);
  return {
    originX,
    originY,
    width: Math.max(1, Math.round(right) - originX),
    height: Math.max(1, Math.round(bottom) - originY),
  };
}

/**
 * The resize that puts the crop's long side at SCAN_LONG_EDGE, never
 * larger than it already is: the website's `scanSize`.
 */
export function scanResize(crop: {
  width: number;
  height: number;
}): { width: number } | { height: number } {
  return crop.height >= crop.width
    ? { height: Math.min(crop.height, SCAN_LONG_EDGE) }
    : { width: Math.min(crop.width, SCAN_LONG_EDGE) };
}
