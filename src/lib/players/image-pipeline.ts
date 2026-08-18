/**
 * Getting a photo from a Mac into a 2MB bucket.
 *
 * The founder's report: "cant upload header photos on mac - may have a
 * high limit on MB size. build in a compressor." He is right about the
 * cause. A screenshot off a Retina display is 4000px wide and several
 * megabytes, an iPhone photo more, and the avatars bucket takes 2MB —
 * so the picker refused files that were perfectly good pictures.
 *
 * Raising the limit would be the wrong fix. The server crops every
 * upload to 512x512 or 1200x450 anyway, so a 12MB original is 12MB
 * carried across a shop's wifi to be thrown away. Shrinking first is
 * faster for the person AND cheaper for us.
 *
 * Runs in the browser on purpose. `createImageBitmap` and a canvas are
 * everywhere, need no dependency, and keep the big file off the wire
 * entirely — a server-side resize would still have to receive it.
 *
 * Free of React and of server-only imports, so the rules are testable
 * and the same pipeline can feed both the picture and the banner.
 */

/** What the caller wants back. */
export interface ImageTarget {
  /** Final pixel width. The server crops to this too; matching it saves a pass. */
  width: number;
  height: number;
  /** The ceiling the bucket enforces. */
  maxBytes: number;
}

/** Where in the source image the visible rectangle sits. */
export interface CropBox {
  /** Fractions of the source, 0-1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The whole picture, letterboxed to fit rather than cropped. */
export const FULL_CROP: CropBox = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The quality ladder.
 *
 * Walked from the top until the result fits. Stepping down beats
 * guessing a single number: a flat photograph lands at 0.9 and a busy
 * screenshot of a card list keeps going, and both come out as small as
 * they need to be rather than as small as the worst case would need.
 */
const QUALITIES = [0.92, 0.82, 0.72, 0.6, 0.5, 0.4];

/**
 * The centred square, or the centred band, of a source image.
 *
 * What a cropper opens on, so somebody who does not want to fiddle can
 * pick a file and be done.
 */
export function centredCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropBox {
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > aspect) {
    /* Wider than wanted: take a full-height slice out of the middle. */
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
 * The crop box for a given zoom and centre.
 *
 * Zoom is how many times into the picture we are: 1 fits the frame, 2
 * shows half of it. Expressed this way so a slider maps to it directly
 * and the maths stays in one place.
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

/** The file a resize produced, and what it cost. */
export interface PreparedImage {
  file: File;
  /** Bytes before and after, so the UI can say what it did. */
  wasBytes: number;
  nowBytes: number;
}

/**
 * Draws a source image into the target box and returns a file that fits.
 *
 * Always re-encodes, even when the original would have squeaked under
 * the limit: a 4000px source cropped to 512 by the server is bandwidth
 * spent on pixels nobody will ever see.
 */
export async function prepareImage(
  file: File,
  target: ImageTarget,
  crop: CropBox = FULL_CROP,
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context");

    /* Smoothing on, and at the best setting the browser offers: a
       downscale without it is the aliased mess people call "pixelated". */
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      bitmap,
      crop.x * bitmap.width,
      crop.y * bitmap.height,
      crop.width * bitmap.width,
      crop.height * bitmap.height,
      0,
      0,
      target.width,
      target.height,
    );

    for (const quality of QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );

      if (!blob) break;

      if (blob.size <= target.maxBytes) {
        return {
          file: new File([blob], renamed(file.name), { type: "image/jpeg" }),
          wasBytes: file.size,
          nowBytes: blob.size,
        };
      }
    }

    /*
     * Every quality was still too big, which at these dimensions means
     * something pathological. Hand back the last attempt rather than
     * throwing: the server checks the size too and will say so plainly.
     */
    const last = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITIES[QUALITIES.length - 1]),
    );

    if (!last) throw new Error("Could not encode the image");

    return {
      file: new File([last], renamed(file.name), { type: "image/jpeg" }),
      wasBytes: file.size,
      nowBytes: last.size,
    };
  } finally {
    /* Released explicitly. A bitmap of a 12MP photo is 48MB of memory,
       and a profile page somebody fiddles with for a minute should not
       hold six of them. */
    bitmap.close();
  }
}

/** Keeps the person's own filename, with the extension we actually wrote. */
export function renamed(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "") || "image";
  return `${stem.slice(0, 60)}.jpg`;
}
