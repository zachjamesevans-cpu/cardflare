/**
 * The crop box, as a fraction of the picture.
 *
 * The same arithmetic the website's cropper runs
 * (src/lib/players/image-pipeline.ts: centredCrop, clampCrop, cropFor),
 * kept here without a DOM in sight so the app can crop the same way and
 * tests/unit/app-crop-box.test.ts can walk both through the same cases.
 * `x`, `y`, `width` and `height` are all in 0..1 of the source.
 */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The centred square, or the centred band, of a source image. */
export function centredCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropBox {
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > aspect) {
    const width = aspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }

  const height = sourceAspect / aspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Keeps a crop box inside the picture after a drag or a zoom. */
export function clampCrop(box: CropBox): CropBox {
  const width = Math.min(1, Math.max(0.05, box.width));
  const height = Math.min(1, Math.max(0.05, box.height));

  return {
    width,
    height,
    x: Math.min(Math.max(0, box.x), 1 - width),
    y: Math.min(Math.max(0, box.y), 1 - height),
  };
}

/**
 * The crop box for a given zoom and centre. Zoom 1 fits the frame, 2
 * shows half of the picture; the centre is where the frame looks.
 */
export function cropFor(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
  zoom: number,
  centre: { x: number; y: number },
): CropBox {
  const base = centredCrop(sourceWidth, sourceHeight, aspect);
  const scale = 1 / Math.max(1, zoom);
  const width = base.width * scale;
  const height = base.height * scale;

  return clampCrop({
    x: centre.x - width / 2,
    y: centre.y - height / 2,
    width,
    height,
  });
}

/**
 * Where to draw the whole picture so that `crop` fills a frame of
 * `frameWidth` by `frameHeight`: the picture's drawn size and its
 * offset, in the frame's own pixels. Used for the crop frame itself
 * and for the small preview under it, which is the same drawing at a
 * different frame size.
 */
export function drawFor(
  crop: CropBox,
  frameWidth: number,
  frameHeight: number,
): { width: number; height: number; left: number; top: number } {
  const width = frameWidth / crop.width;
  const height = frameHeight / crop.height;
  return {
    width,
    height,
    left: -crop.x * width,
    top: -crop.y * height,
  };
}

/** The crop in the source's pixels, for the image manipulator. */
export function cropInPixels(
  crop: CropBox,
  sourceWidth: number,
  sourceHeight: number,
): { originX: number; originY: number; width: number; height: number } {
  const originX = Math.round(crop.x * sourceWidth);
  const originY = Math.round(crop.y * sourceHeight);
  return {
    originX,
    originY,
    width: Math.max(
      1,
      Math.min(sourceWidth - originX, Math.round(crop.width * sourceWidth)),
    ),
    height: Math.max(
      1,
      Math.min(sourceHeight - originY, Math.round(crop.height * sourceHeight)),
    ),
  };
}
