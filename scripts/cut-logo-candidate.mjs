/**
 * Cuts a supplied logo off its flat grey card, so it can be tried as the
 * brand master without the grey coming with it.
 *
 * The founder's candidate arrived flattened on rgb(84,84,84) with a soft
 * DARK shadow around the art (down to about rgb(64,64,64)). Two things
 * make a plain colour key useless here:
 *
 * - The card's own face is the same grey as the background, pixel for
 *   pixel. Keying on colour punches a hole straight through the middle
 *   of the card and takes the star with it.
 * - The shadow is background too, and it is not one value, so a single
 *   tolerance either keeps a dark halo or eats the artwork's edge.
 *
 * So the background is found by REACHABILITY, not by colour: flood fill
 * inward from the border across neutral, dark pixels. The card face is
 * enclosed by the green frame, so the fill never reaches it and it
 * survives; the shadow is open to the border, so it goes.
 *
 * Edges are then un-composited the way cutOutWordmark does it in
 * generate-brand-assets.mjs. A pixel on the boundary is a mixture of the
 * background and whatever art it touches, so its coverage is how far it
 * has travelled from the background towards its own neighbour's colour -
 * measured against that neighbour rather than a fixed constant, because
 * the mark runs from bright lime to a much darker flare tail and one
 * global distance would make the tail half transparent.
 *
 * Usage: node scripts/cut-logo-candidate.mjs <in.png> <out.png>
 */
import { resolve } from "node:path";

import sharp from "sharp";

/* Neutral and dark enough to be the card it was flattened on. The art's
   own greys sit here too, which is fine - only what the fill can REACH
   from the border is removed. */
const NEUTRAL_SPREAD = 16; // max channel spread still called grey
const BACKDROP_MAX = 130; // brightest grey still called backdrop

/** How far out from the cut the edge treatment looks. */
const EDGE_RING = 2;

function isBackdrop(r, g, b) {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread <= NEUTRAL_SPREAD && Math.max(r, g, b) <= BACKDROP_MAX;
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error("usage: node scripts/cut-logo-candidate.mjs <in.png> <out.png>");
    process.exit(1);
  }

  const { data, info } = await sharp(resolve(inPath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: W, height: H, channels: C } = info;
  const N = W * H;
  const at = (x, y) => (y * W + x) * C;

  /* ---- 1. Flood fill the backdrop inward from every border pixel ---- */

  const removed = new Uint8Array(N); // 1 = backdrop, reachable from outside
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;

  const push = (x, y) => {
    const p = y * W + x;
    if (removed[p]) return;
    const i = p * C;
    if (!isBackdrop(data[i], data[i + 1], data[i + 2])) return;
    removed[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  /* The backdrop's own colour, averaged over what the fill actually took,
     so the un-compositing below subtracts the real grey rather than an
     assumed one. */
  let br = 0;
  let bg = 0;
  let bb = 0;
  let n = 0;
  for (let p = 0; p < N; p++) {
    if (!removed[p]) continue;
    const i = p * C;
    br += data[i];
    bg += data[i + 1];
    bb += data[i + 2];
    n++;
  }
  const BR = br / n;
  const BG = bg / n;
  const BB = bb / n;

  const distFromBackdrop = (r, g, b) => Math.hypot(r - BR, g - BG, b - BB);

  /* ---- 2. Rebuild, un-compositing the boundary ---- */

  const out = Buffer.alloc(N * 4);

  for (let p = 0; p < N; p++) {
    const o = p * 4;
    if (removed[p]) continue; // leaves 0,0,0,0

    const i = p * C;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const x = p % W;
    const y = (p / W) | 0;

    /* Is this pixel on the cut? Only those are mixtures. */
    let onEdge = false;
    for (let dy = -EDGE_RING; dy <= EDGE_RING && !onEdge; dy++) {
      for (let dx = -EDGE_RING; dx <= EDGE_RING; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (removed[ny * W + nx]) {
          onEdge = true;
          break;
        }
      }
    }

    if (!onEdge) {
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
      continue;
    }

    /* Coverage, measured against the most opinionated kept colour this
       pixel touches - that is the art it is a mixture OF. Falls back to
       fully opaque when it has no such neighbour to compare with. */
    let ref = 0;
    for (let dy = -EDGE_RING; dy <= EDGE_RING; dy++) {
      for (let dx = -EDGE_RING; dx <= EDGE_RING; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (removed[q]) continue;
        const j = q * C;
        const d = distFromBackdrop(data[j], data[j + 1], data[j + 2]);
        if (d > ref) ref = d;
      }
    }

    const a = ref > 0 ? Math.min(1, distFromBackdrop(r, g, b) / ref) : 1;

    if (a < 4 / 255) continue; // indistinguishable from the card it sat on

    /* C = fg·a + backdrop·(1−a), solved for fg. */
    const un = (v, base) =>
      Math.max(0, Math.min(255, Math.round((v - base * (1 - a)) / a)));

    out[o] = un(r, BR);
    out[o + 1] = un(g, BG);
    out[o + 2] = un(b, BB);
    out[o + 3] = Math.round(a * 255);
  }

  const kept = out.filter((_, k) => k % 4 === 3).length;

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(resolve(outPath));

  const removedCount = removed.reduce((s, v) => s + v, 0);
  console.log(
    `backdrop rgb(${BR.toFixed(0)},${BG.toFixed(0)},${BB.toFixed(0)}) — ` +
      `${((removedCount / N) * 100).toFixed(1)}% of ${W}x${H} cut away ` +
      `(${kept ? "" : ""}${outPath})`,
  );
}

await main();
