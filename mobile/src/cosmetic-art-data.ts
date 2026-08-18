/**
 * What a worn ring and a worn aura are made of, as data.
 *
 * The website draws these from CSS: a conic gradient spun by keyframes,
 * a drop-shadow for the glow, and a tiled particle layer over the top.
 * React Native has none of that — no conic gradients, no keyframes, no
 * blend modes — so until now a phone drew a FLAT COLOUR where the web
 * drew a moving ring. The code said so out loud: "standing still is the
 * honest version of it until Skia draws these."
 *
 * This is Skia drawing them. Same palettes, same periods, same glows, so
 * a ring somebody paid Embers for looks like the same ring on both
 * platforms.
 *
 * GENERATED FROM src/app/cosmetic-art.css, which stays the source of
 * truth. The colour stops and the animation periods below were read out
 * of the stylesheet rather than transcribed by eye — twenty-five rings
 * of hand-copied hex is twenty-five chances to be subtly wrong about
 * somebody's purchase. Re-run the extraction when the stylesheet
 * changes; `tests/unit/app-cosmetic-art.test.ts` fails when the two
 * drift.
 *
 * The conversion worth knowing about: a CSS conic gradient becomes a
 * Skia sweep gradient, and CSS's two stop syntaxes mean different
 * things. Bare colours spread evenly; `#aaa 8% 16%` is a HARD BAND, so
 * it becomes two entries at the same colour. That is why Frozen has
 * twenty stops and Inferno has seven.
 */

/** One ring's art. `spinSeconds` null means it does not turn. */
export interface RingArt {
  colors: string[];
  /** Matching 0-1 positions around the sweep. Same length as `colors`. */
  positions: number[];
  spinSeconds: number | null;
  glow: { color: string; radius: number } | null;
}

export const RING_ART: Record<string, RingArt> = {
  "ring-inferno": {
    colors: ["#7a1d05", "#e8531f", "#ffb03a", "#ffe08a", "#ff8c2e", "#c22f0b", "#7a1d05"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 3.6,
    glow: { color: "rgba(255, 122, 47, 0.8)", radius: 7 },
  },
  "ring-frozen": {
    colors: ["#bfe4ff", "#bfe4ff", "#6db7e8", "#6db7e8", "#eaf7ff", "#eaf7ff", "#8ecdf2", "#8ecdf2", "#cfeaff", "#cfeaff", "#5da5dd", "#5da5dd", "#eaf7ff", "#eaf7ff", "#9ed4f4", "#9ed4f4", "#6db7e8", "#6db7e8", "#bfe4ff", "#bfe4ff"],
    positions: [0, 0.08, 0.08, 0.16, 0.16, 0.22, 0.22, 0.34, 0.34, 0.42, 0.42, 0.55, 0.55, 0.62, 0.62, 0.76, 0.76, 0.88, 0.88, 1],
    spinSeconds: 26,
    glow: { color: "rgba(140, 200, 255, 0.7)", radius: 6 },
  },
  "ring-electric": {
    colors: ["#241b52", "#4f46e5", "#a5b4fc", "#4f46e5", "#241b52"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 5,
    glow: { color: "rgba(129, 140, 248, 0.85)", radius: 7 },
  },
  "ring-galaxy": {
    colors: ["#191036", "#4c2a85", "#7b5cd6", "#2b3f8f", "#171d4c", "#5b2a7a", "#191036"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 18,
    glow: { color: "rgba(123, 92, 214, 0.7)", radius: 8 },
  },
  "ring-gold-foil": {
    colors: ["#8a6414", "#8a6414", "#f0c24b", "#fff3c4", "#f0c24b", "#8a6414", "#c9992e", "#fff3c4", "#f0c24b", "#8a6414", "#f0c24b", "#fff3c4", "#c9992e", "#8a6414"],
    positions: [0, 0.06, 0.1, 0.14, 0.18, 0.26, 0.38, 0.44, 0.52, 0.62, 0.72, 0.78, 0.88, 1],
    spinSeconds: 9,
    glow: { color: "rgba(240, 194, 75, 0.65)", radius: 6 },
  },
  "ring-rainbow-foil": {
    colors: ["#ff5e5e", "#ffb44d", "#f4e04d", "#6ee7a8", "#5eb9ff", "#9b8cff", "#ff7ad9", "#ff5e5e"],
    positions: [0, 0.1429, 0.2857, 0.4286, 0.5714, 0.7143, 0.8571, 1],
    spinSeconds: 6,
    glow: { color: "rgba(255, 255, 255, 0.35)", radius: 7 },
  },
  "ring-manga": {
    colors: ["#0b0d11", "#f4f6f8", "#0b0d11", "#f4f6f8"],
    positions: [0, 0.3333, 0.6667, 1],
    spinSeconds: 14,
    glow: null,
  },
  "ring-pixel": {
    colors: ["#c6ee4f", "#5eb9ff", "#ff7ad9", "#f4e04d"],
    positions: [0, 0.3333, 0.6667, 1],
    spinSeconds: 8,
    glow: null,
  },
  "ring-glitch": {
    colors: ["#29e6e6", "#29e6e6", "#ef3ef0", "#ef3ef0", "#29e6e6", "#29e6e6", "#f4f6f8", "#f4f6f8", "#ef3ef0", "#ef3ef0"],
    positions: [0, 0.32, 0.32, 0.55, 0.55, 0.71, 0.71, 0.74, 0.74, 1],
    spinSeconds: 7,
    glow: null,
  },
  "ring-vaporwave": {
    colors: ["#ff71ce", "#01cdfe", "#b967ff", "#ff71ce"],
    positions: [0, 0.3333, 0.6667, 1],
    spinSeconds: 11,
    glow: { color: "rgba(1, 205, 254, 0.6)", radius: 9 },
  },
  "ring-aurora": {
    colors: ["#0e3b2e", "#2fbf8f", "#7ee8c7", "#2b6cb0", "#14324f", "#2fbf8f", "#0e3b2e"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 16,
    glow: { color: "rgba(96, 220, 180, 0.55)", radius: 7 },
  },
  "ring-ember": {
    colors: ["#5a1d05", "#b2400e", "#ff7a2f", "#b2400e", "#5a1d05"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 12,
    glow: null,
  },
  "ring-smoke": {
    colors: ["#23272e", "#4b5563", "#6b7280", "#374151", "#23272e", "#4b5563", "#23272e"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 22,
    glow: null,
  },
  "ring-water": {
    colors: ["#0b3a5c", "#2b7bb8", "#9fd8f5", "#2b7bb8", "#0b3a5c", "#1d5f92", "#0b3a5c"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 8,
    glow: { color: "rgba(80, 170, 230, 0.6)", radius: 6 },
  },
  "ring-sakura": {
    colors: ["#f9c9dd", "#f39ec2", "#fde7f0", "#f39ec2", "#f9c9dd"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 20,
    glow: null,
  },
  "ring-heart": {
    colors: ["#8f2447", "#e05587", "#ffb1cd", "#e05587", "#8f2447"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 13,
    glow: null,
  },
  "ring-crown": {
    colors: ["#8a6414", "#d9a92f", "#fff3c4", "#d9a92f", "#8a6414"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 15,
    glow: null,
  },
  "ring-starfield": {
    colors: ["#0a0f1e", "#17223e", "#0a0f1e", "#131c33", "#0a0f1e"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: null,
    glow: null,
  },
  "ring-meteor": {
    colors: ["#0c1226", "#0c1226", "#24365e", "#9db8ff", "#eef4ff", "#0c1226", "#0c1226"],
    positions: [0, 0.58, 0.72, 0.84, 0.91, 0.97, 1],
    spinSeconds: 2.6,
    glow: { color: "rgba(157, 184, 255, 0.7)", radius: 6 },
  },
  "ring-diamond": {
    colors: ["#f8fbff", "#f8fbff", "#b9c7d8", "#b9c7d8", "#ffffff", "#ffffff", "#d7e2ee", "#d7e2ee", "#f2f7fc", "#f2f7fc", "#aebccd", "#aebccd", "#ffffff", "#ffffff", "#d7e2ee", "#d7e2ee", "#b9c7d8", "#b9c7d8", "#f8fbff", "#f8fbff"],
    positions: [0, 0.09, 0.09, 0.15, 0.15, 0.21, 0.21, 0.33, 0.33, 0.4, 0.4, 0.52, 0.52, 0.58, 0.58, 0.73, 0.73, 0.85, 0.85, 1],
    spinSeconds: 10,
    glow: null,
  },
  "ring-black-flame": {
    colors: ["#05060a", "#1d1030", "#4a1d6e", "#241238", "#05060a", "#33124d", "#05060a"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 4.4,
    glow: { color: "rgba(90, 40, 140, 0.75)", radius: 7 },
  },
  "ring-white-flame": {
    colors: ["#dfe9f2", "#ffffff", "#bcd6ea", "#ffffff", "#dfe9f2", "#eef6fc", "#dfe9f2"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 4.4,
    glow: { color: "rgba(235, 245, 255, 0.85)", radius: 8 },
  },
  "ring-retro-arcade": {
    colors: ["#ff3355", "#ffb400", "#21d07c", "#2ba9ff", "#b967ff"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 9,
    glow: { color: "rgba(43, 169, 255, 0.5)", radius: 6 },
  },
  "ring-crt": {
    colors: ["#07120b", "#124a26", "#2fbf6b", "#124a26", "#07120b"],
    positions: [0, 0.25, 0.5, 0.75, 1],
    spinSeconds: 17,
    glow: null,
  },
  "ring-prestige": {
    colors: ["#c6ee4f", "#f0c24b", "#fff3c4", "#c6ee4f", "#8ba635", "#f0c24b", "#c6ee4f"],
    positions: [0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1],
    spinSeconds: 7,
    glow: { color: "rgba(240, 194, 75, 0.45)", radius: 12 },
  },};

/**
 * How an aura moves.
 *
 * Every one is a field of small particles with a motion, which is the
 * same shape the CSS uses — a tiled glyph plus one keyframe. Skia draws
 * the glyphs rather than tiling a background image, so the particle
 * count is chosen here instead of falling out of a background-size.
 */
export type AuraMotion = "rise" | "fall" | "drift" | "twinkle" | "flicker";

export interface AuraArt {
  motion: AuraMotion;
  seconds: number;
  opacity: number;
  /** Drawn per particle. Two colours alternate, as the CSS layers two. */
  colors: [string, string];
  /** How many particles orbit the picture. */
  count: number;
  /** Particle radius as a fraction of the avatar's size. */
  scale: number;
}

export const AURA_ART: Record<string, AuraArt> = {
  "aura-sparks": {
    motion: "rise",
    seconds: 5,
    opacity: 0.9,
    colors: ["#ffd27a", "#ff8c2e"],
    count: 14,
    scale: 0.035,
  },
  "aura-bubbles": {
    motion: "rise",
    seconds: 8.5,
    opacity: 0.8,
    colors: ["#bfe4ff", "#eaf7ff"],
    count: 11,
    scale: 0.05,
  },
  "aura-hearts": {
    motion: "rise",
    seconds: 7.5,
    opacity: 0.85,
    colors: ["#ff8fb1", "#ffd0dd"],
    count: 10,
    scale: 0.045,
  },
  "aura-sakura": {
    motion: "drift",
    seconds: 9,
    opacity: 0.85,
    colors: ["#ffc9dd", "#fff0f5"],
    count: 12,
    scale: 0.045,
  },
  "aura-holo-shards": {
    motion: "drift",
    seconds: 10,
    opacity: 0.85,
    colors: ["#a5b4fc", "#7fe3d4"],
    count: 12,
    scale: 0.04,
  },
  "aura-snow": {
    motion: "fall",
    seconds: 8,
    opacity: 0.85,
    colors: ["#eaf7ff", "#bfe4ff"],
    count: 14,
    scale: 0.035,
  },
  "aura-stars": {
    motion: "twinkle",
    seconds: 2.8,
    opacity: 0.9,
    colors: ["#ffe08a", "#fff6d5"],
    count: 13,
    scale: 0.035,
  },
  "aura-static": {
    motion: "flicker",
    seconds: 1.6,
    opacity: 0.85,
    colors: ["#a5b4fc", "#eaf7ff"],
    count: 16,
    scale: 0.028,
  },
};

/** Whether a phone can draw this slug rather than approximating it. */
export function hasRingArt(slug: string | null): boolean {
  return Boolean(slug && slug in RING_ART);
}

export function hasAuraArt(slug: string | null): boolean {
  return Boolean(slug && slug in AURA_ART);
}
