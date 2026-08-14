/**
 * Regenerates optimized derivatives of the approved CardFlare logo.
 *
 * The approved master (public/brand/cardflare-logo.png) is never redrawn or
 * rewritten — it is only read. The master is a transparent PNG of the
 * card-and-flare mark, drawn on a square canvas with uneven padding, so the
 * derivatives trim to the artwork's own bounds and rebuild the padding
 * deliberately for each context. See BRAND.md.
 *
 * Usage: npm run brand:assets
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const MASTER = resolve(ROOT, "public/brand/cardflare-logo.png");

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

  // Splash mark: the trimmed artwork on transparency, sized by height as
  // the brand rules ask. app.json's imageWidth then scales it down; the
  // dark backdrop behind it comes from the splash config, not the file.
  await write(
    resolve(ROOT, "mobile/assets/splash-icon.png"),
    await trimmedMark().resize({ height: 512 }).png(png).toBuffer(),
  );

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
