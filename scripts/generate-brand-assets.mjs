/**
 * Regenerates optimized derivatives of the approved CardFlare logo.
 *
 * The approved master (public/brand/cardflare-logo.png) is never redrawn — it is
 * only losslessly re-encoded. The master ships as an opaque black square behind the
 * circular badge, so the web derivatives apply a circular alpha mask to drop the
 * black field. The badge artwork itself is untouched. See BRAND.md.
 *
 * Usage: npm run brand:assets
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const MASTER = resolve(ROOT, "public/brand/cardflare-logo.png");

// Measured from the master: the badge circle's centre and radius in source pixels.
// The radius is pulled in slightly so the anti-aliased edge (which blends toward
// the black field) is clipped rather than left as a dark halo.
const CIRCLE = { cx: 627, cy: 624, r: 615 };

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  console.log(
    `  ${path.replace(`${ROOT}/`, "")}  ${(buffer.length / 1024).toFixed(1)} KB`,
  );
}

/**
 * Crops the master to the badge circle, scales it, and masks the surrounding
 * black field out. sharp always composites after resizing, so the mask is built
 * at the output size rather than the source size.
 */
async function maskedBadge(size) {
  const { cx, cy, r } = CIRCLE;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

  return sharp(MASTER)
    .extract({ left: cx - r, top: cy - r, width: r * 2, height: r * 2 })
    .resize(size, size)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
}

async function main() {
  console.log("Generating CardFlare brand assets…");

  // The master is deliberately never rewritten: re-encoding it through sharp is
  // not bit-lossless (colour-profile chunks are dropped), and it is an archival
  // asset rather than something the page loads. Only the derivatives below are
  // optimized, and those are what the site actually serves.

  // Transparent circular mark used throughout the UI and as the favicon source.
  for (const [path, size] of [
    [resolve(ROOT, "public/brand/cardflare-mark.png"), 512],
    [resolve(ROOT, "src/app/icon.png"), 256],
  ]) {
    await write(path, await maskedBadge(size));
  }

  // Apple touch icon: iOS squares and opaques the icon anyway, so bake the badge
  // onto the brand background with padding instead of letting iOS crop it.
  await write(
    resolve(ROOT, "src/app/apple-icon.png"),
    await sharp({
      create: {
        width: 180,
        height: 180,
        channels: 4,
        background: "#12151b",
      },
    })
      .composite([{ input: await maskedBadge(156) }])
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer(),
  );

  console.log("Done.");
}

await main();
