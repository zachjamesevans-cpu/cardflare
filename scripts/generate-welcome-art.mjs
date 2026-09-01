/**
 * Draws the welcome screen's background: a table of face-down,
 * imagined cards, scattered under a heavy vignette.
 *
 * The founder supplied a mock with a collage of fantasy card art behind
 * the lockup. Real game cards are other people's IP and stock fantasy
 * art is somebody else's product, so this draws the collage instead:
 * every "card" is our own geometry — a dark sleeve, a glowing frame in
 * one of the brand's game hues, the flare star from our own mark's
 * vocabulary, and a title bar of unreadable glyph lines. Close in
 * spirit, entirely ours.
 *
 * Output: mobile/assets/welcome-cards.png (1284x2778, iPhone 3x).
 * Usage: npm run app:welcome-art
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "mobile/assets/welcome-cards.png");

const W = 1284;
const H = 2778;

/** The brand's hues, weighted toward the lime the product wears. */
const HUES = {
  lime: "#c6ee4f",
  frost: "#6ec3ff",
  galaxy: "#6d4aff",
  ember: "#ff8a3d",
  rose: "#ff6fb5",
  gold: "#f0c24b",
};

/** An eight-point flare star, echoing the mark. */
function star(cx, cy, outer, inner) {
  const points = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    points.push(
      `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`,
    );
  }
  return points.join(" ");
}

/** One card, drawn at origin; placed and rotated by its <g>. */
function card(id, w, hue, scale) {
  const h = w * 1.4;
  const inset = w * 0.055;
  const artX = inset;
  const artY = inset;
  const artW = w - inset * 2;
  const artH = h * 0.62;
  const barY = artY + artH + h * 0.04;
  const cx = w / 2;
  const cy = artY + artH / 2;

  return `
    <g>
      <rect x="0" y="0" width="${w}" height="${h}" rx="${w * 0.07}"
        fill="#0c1015" stroke="${hue}" stroke-opacity="0.16" stroke-width="${w * 0.03}"/>
      <rect x="0" y="0" width="${w}" height="${h}" rx="${w * 0.07}"
        fill="none" stroke="${hue}" stroke-opacity="0.55" stroke-width="${w * 0.012}"/>
      <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="${w * 0.04}"
        fill="url(#art-${id})"/>
      <polygon points="${star(cx, cy, artW * 0.3 * scale, artW * 0.115 * scale)}"
        fill="${hue}" fill-opacity="0.42"/>
      <polygon points="${star(cx, cy, artW * 0.17 * scale, artW * 0.066 * scale)}"
        fill="${hue}" fill-opacity="0.75"/>
      <rect x="${artX}" y="${barY}" width="${artW}" height="${h * 0.085}" rx="${w * 0.03}"
        fill="#000000" fill-opacity="0.45"/>
      <rect x="${artX + artW * 0.18}" y="${barY + h * 0.028}" width="${artW * 0.64}" height="${h * 0.022}" rx="${h * 0.011}"
        fill="${hue}" fill-opacity="0.35"/>
      <rect x="${artX + artW * 0.08}" y="${barY + h * 0.11}" width="${artW * 0.84}" height="${h * 0.014}" rx="${h * 0.007}"
        fill="#8593a4" fill-opacity="0.28"/>
      <rect x="${artX + artW * 0.16}" y="${barY + h * 0.145}" width="${artW * 0.68}" height="${h * 0.014}" rx="${h * 0.007}"
        fill="#8593a4" fill-opacity="0.2"/>
      <circle cx="${w * 0.13}" cy="${h * 0.935}" r="${w * 0.035}" fill="${hue}" fill-opacity="0.4"/>
      <circle cx="${w * 0.87}" cy="${h * 0.935}" r="${w * 0.035}" fill="${hue}" fill-opacity="0.4"/>
    </g>`;
}

/**
 * The table. Placed by hand: edges and corners busy, the middle held
 * darker for the lockup, the lower third calm for the buttons.
 * x/y are the card's centre, in canvas fractions.
 */
const CARDS = [
  { x: 0.08, y: 0.05, w: 500, rot: -24, hue: HUES.gold, s: 1.15 },
  { x: 0.45, y: 0.08, w: 560, rot: 12, hue: HUES.lime, s: 0.85 },
  { x: 0.88, y: 0.13, w: 540, rot: 28, hue: HUES.rose, s: 1.0 },
  { x: 0.06, y: 0.26, w: 520, rot: 18, hue: HUES.frost, s: 0.9 },
  { x: 0.55, y: 0.28, w: 460, rot: -8, hue: HUES.galaxy, s: 0.75 },
  { x: 0.97, y: 0.36, w: 560, rot: -18, hue: HUES.lime, s: 1.1 },
  { x: 0.1, y: 0.47, w: 540, rot: -6, hue: HUES.gold, s: 0.95 },
  { x: 0.55, y: 0.52, w: 480, rot: 22, hue: HUES.lime, s: 0.8 },
  { x: 0.94, y: 0.6, w: 500, rot: 10, hue: HUES.ember, s: 1.05 },
  { x: 0.05, y: 0.68, w: 520, rot: 26, hue: HUES.ember, s: 0.9 },
  { x: 0.5, y: 0.75, w: 540, rot: -14, hue: HUES.frost, s: 1.0 },
  { x: 0.95, y: 0.82, w: 520, rot: -26, hue: HUES.galaxy, s: 0.85 },
  { x: 0.12, y: 0.9, w: 560, rot: -10, hue: HUES.rose, s: 1.1 },
  { x: 0.6, y: 0.96, w: 540, rot: 16, hue: HUES.gold, s: 0.95 },
];

function gradients() {
  return CARDS.map((c, i) => {
    return `<radialGradient id="art-${i}" cx="50%" cy="35%" r="85%">
      <stop offset="0%" stop-color="${c.hue}" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="${c.hue}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#05070a" stop-opacity="1"/>
    </radialGradient>`;
  }).join("\n");
}

function placedCards() {
  return CARDS.map((c, i) => {
    const h = c.w * 1.4;
    const x = c.x * W - c.w / 2;
    const y = c.y * H - h / 2;
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${c.rot} ${(c.w / 2).toFixed(0)} ${(h / 2).toFixed(0)})">${card(i, c.w, c.hue, c.s ?? 1)}</g>`;
  }).join("\n");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    ${gradients()}
    <radialGradient id="pocket" cx="50%" cy="44%" r="60%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.86"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.8"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#05070a"/>
  ${placedCards()}

  <!-- The card table recedes: an overall dim, a dark pocket behind the
       lockup, and a floor of black under the buttons and footer. -->
  <rect width="${W}" height="${H}" fill="#000000" fill-opacity="0.4"/>
  <rect width="${W}" height="${H}" fill="url(#pocket)"/>
  <rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#foot)"/>
</svg>`;

const buffer = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, effort: 10, palette: true, colors: 256 })
  .toBuffer();

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, buffer);

const { width, height } = await sharp(buffer).metadata();
console.log(
  `${OUT.replace(`${ROOT}/`, "")} ${width}x${height} ${(buffer.length / 1024).toFixed(1)} KB`,
);
