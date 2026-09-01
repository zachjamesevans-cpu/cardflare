/**
 * Regenerates optimized derivatives of the approved cardflare brand art.
 *
 * Two masters, both only ever read, never redrawn or rewritten:
 *
 * - public/brand/cardflare-logo.png — the card-and-flare mark, a
 *   transparent PNG on a square canvas with uneven padding, so the
 *   derivatives trim to the artwork's own bounds and rebuild the padding
 *   deliberately for each context.
 * - public/brand/cardflare-wordmark.png — the founder's wordmark art
 *   ("Just put this everywhere", 2026-08-25). It was supplied flattened
 *   on a white card, so the derivative CUTS the lettering out: alpha
 *   from distance-to-white, colours un-composited so the soft glow keeps
 *   its own green instead of dragging white onto a dark page.
 *
 * See BRAND.md.
 *
 * Usage: npm run brand:assets
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const MASTER = resolve(ROOT, "public/brand/cardflare-logo.png");
const WORDMARK_MASTER = resolve(ROOT, "public/brand/cardflare-wordmark.png");

/**
 * Backdrop for the square app icons.
 *
 * The mark's card face is dark, so a transparent icon risks vanishing into a
 * dark browser tab strip or home screen. Sitting it on the brand background
 * keeps it legible everywhere. Matches --color-canvas, nudged lighter so the
 * icon reads as a distinct object rather than a hole in the page.
 */
const ICON_BACKDROP = "#12151b";

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  const { width, height } = await sharp(buffer).metadata();
  console.log(
    `  ${path.replace(`${ROOT}/`, "").padEnd(34)} ${`${width}x${height}`.padEnd(9)} ${(buffer.length / 1024).toFixed(1)} KB`,
  );
}

const png = { compressionLevel: 9, effort: 10 };

/** The master cropped to the artwork's own bounding box. */
function trimmedMark() {
  // threshold 1 trims on alpha, so only fully transparent padding is removed.
  return sharp(MASTER).trim({ threshold: 1 });
}

/**
 * Letter interiors keep min(r,g,b) at or below this (measured off the
 * master: the body is around rgb(222,250,28) shaded down to the high
 * 20s, with the emboss highlights reaching the mid 80s). At or below it
 * a pixel is solid ink; from there up to white, alpha ramps down so the
 * glow fades out instead of snapping off.
 */
const WORDMARK_BODY_MIN = 85;

/**
 * The wordmark, cut off its white card.
 *
 * The founder's file is flattened on white, and laying white pixels on
 * the dark site is not an option. Every pixel gets alpha from how far
 * its dimmest channel sits from white, and the partially transparent
 * ones are un-composited (C = fg·a + white·(1−a), solved for fg) so the
 * halo around each letter stays the art's own light green rather than
 * the white it was photographed on. Solid ink keeps its exact colour,
 * emboss shading included.
 */
async function cutOutWordmark() {
  const { data, info } = await sharp(WORDMARK_MASTER)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc((data.length / info.channels) * 4);

  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const a = Math.min(1, (255 - Math.min(r, g, b)) / (255 - WORDMARK_BODY_MIN));

    // JPEG shimmer sits a count or two off pure white; cut it dead.
    if (a < 8 / 255) continue;

    const lift = 255 * (1 - a);
    out[o] = Math.max(0, Math.min(255, Math.round((r - lift) / a)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round((g - lift) / a)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round((b - lift) / a)));
    out[o + 3] = Math.round(a * 255);
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).trim({ threshold: 10 });
}

/** Scales the trimmed mark to fit a square of `size`, leaving `margin` around it. */
async function markInSquare(size, margin, background) {
  const inner = size - margin * 2;
  const art = await trimmedMark()
    .resize({ width: inner, height: inner, fit: "inside" })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, gravity: "center" }])
    .png(png)
    .toBuffer();
}

/**
 * The splash lockup: aura, mark, wordmark, in the app's own proportions.
 *
 * Composed from the two masters like every other derivative — the aura
 * is the only drawn element, and it is a plain radial fade of the brand
 * accent, no new artwork. expo-splash-screen scales the whole file by
 * `imageWidth`, so only the internal proportions matter here.
 */
async function splashLockup() {
  const W = 1400;
  const H = 1240;

  /* The accent (#c6ee4f), fading from a whisper to nothing. Subtle on
     purpose: a launch frame, not a light show. */
  const aura = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <defs>
         <radialGradient id="g" cx="50%" cy="50%" r="50%">
           <stop offset="0%" stop-color="#c6ee4f" stop-opacity="0.20"/>
           <stop offset="55%" stop-color="#c6ee4f" stop-opacity="0.07"/>
           <stop offset="100%" stop-color="#c6ee4f" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <circle cx="700" cy="430" r="620" fill="url(#g)"/>
     </svg>`,
  );

  const mark = await trimmedMark().resize({ height: 600 }).png().toBuffer();
  const markWidth = (await sharp(mark).metadata()).width ?? 0;

  const wordmark = await (
    await cutOutWordmark()
  )
    .resize({ width: 960 })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: aura, left: 0, top: 0 },
      { input: mark, left: Math.round((W - markWidth) / 2), top: 130 },
      { input: wordmark, left: Math.round((W - 960) / 2), top: 730 + 90 },
    ])
    .png(png)
    .toBuffer();
}

async function main() {
  console.log("Generating CardFlare brand assets…");

  const { width, height } = await sharp(await trimmedMark().toBuffer()).metadata();
  console.log(
    `  master artwork ${width}x${height} (aspect ${(width / height).toFixed(3)})\n`,
  );

  // Primary mark: trimmed to the artwork, transparent. Used on the dark site
  // and in the social card, where components control their own spacing.
  await write(
    resolve(ROOT, "public/brand/cardflare-mark.png"),
    await trimmedMark().resize({ height: 512 }).png(png).toBuffer(),
  );

  // The wordmark, cut out and trimmed, for every dark surface on both
  // platforms. 256 tall keeps it crisp at three-times pixel density for
  // any header the site or the app actually draws.
  const wordmark = await (
    await cutOutWordmark()
  )
    .resize({ height: 256 })
    .png(png)
    .toBuffer();
  await write(resolve(ROOT, "public/brand/cardflare-wordmark-cut.png"), wordmark);
  await write(resolve(ROOT, "mobile/assets/wordmark.png"), wordmark);

  // Favicon source. Square and backed, so it stays visible on any tab colour.
  // Padding is kept tight — at 16px every pixel of artwork counts.
  await write(
    resolve(ROOT, "src/app/icon.png"),
    await markInSquare(256, 12, ICON_BACKDROP),
  );

  // iOS home screen. iOS squares and opaques icons regardless, so the padding
  // and background are baked in rather than left to the platform.
  await write(
    resolve(ROOT, "src/app/apple-icon.png"),
    await markInSquare(180, 20, ICON_BACKDROP),
  );

  /* ---- The Expo app (mobile/assets) ------------------------------------
     The same mark, in the shapes the app build needs. These files began
     life as Expo's template placeholders; everything below overwrites
     them with derivatives of the approved master, so the home screen,
     the splash and the Android launcher all wear the real brand. */

  // App Store icon: 1024, opaque, and stripped of its alpha channel —
  // Apple rejects icons that keep one.
  await write(
    resolve(ROOT, "mobile/assets/icon.png"),
    await sharp(await markInSquare(1024, 120, ICON_BACKDROP))
      .removeAlpha()
      .png(png)
      .toBuffer(),
  );

  // Splash: the full lockup — a soft lime aura, the mark, and the
  // founder's wordmark art beneath it — on transparency, so the launch
  // frame is the brand and not a lone small mark on a void. The founder,
  // seeing the old one on TestFlight: "the splash screen is hideous."
  // The dark backdrop comes from the splash config (true black, matching
  // the app's canvas so launch does not flash a different dark).
  await write(resolve(ROOT, "mobile/assets/splash-icon.png"), await splashLockup());

  // Android adaptive icon. The launcher masks to the middle ~66% circle,
  // so the foreground keeps the mark well inside that safe zone.
  const androidForeground = await markInSquare(1024, 272, null);
  await write(
    resolve(ROOT, "mobile/assets/android-icon-foreground.png"),
    androidForeground,
  );

  await write(
    resolve(ROOT, "mobile/assets/android-icon-background.png"),
    await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: ICON_BACKDROP },
    })
      .png(png)
      .toBuffer(),
  );

  // Themed-icon variant: Android tints it, so only the silhouette
  // matters — white wherever the mark has ink, transparent elsewhere.
  const monoMask = await sharp(androidForeground).extractChannel(3).png().toBuffer();
  await write(
    resolve(ROOT, "mobile/assets/android-icon-monochrome.png"),
    await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" },
    })
      .joinChannel(monoMask)
      .png(png)
      .toBuffer(),
  );

  console.log("\nDone.");
}

await main();
