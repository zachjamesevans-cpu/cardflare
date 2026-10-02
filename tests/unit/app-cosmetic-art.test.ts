import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANIMATION_ART,
  AURA_ART,
  BACKGROUND_ART,
  hasAnimationArt,
  hasAuraArt,
  hasBackgroundArt,
  hasPatternArt,
  hasRingArt,
  hasSceneArt,
  MOTION_ART,
  PATTERN_ART,
  RING_ART,
  SCENE_ART,
  TEXTURE_ART,
  type PaintLayer,
  type SpriteArt,
  type Timing,
} from "../../mobile/src/cosmetic-art-data";

/**
 * The rings and auras a phone draws, against the stylesheet that
 * defines them.
 *
 * The app had no way to draw a catalogue cosmetic at all until now — a
 * conic gradient spun by keyframes has no React Native equivalent — so
 * a ring somebody spent Embers on came out as a flat band of colour.
 * Skia draws them now, from a table extracted out of
 * `src/app/cosmetic-art.css`.
 *
 * Extracted rather than transcribed, because twenty-five rings of
 * hand-copied hex is twenty-five chances to be subtly wrong about
 * somebody's purchase. This is what keeps the copy honest: the
 * stylesheet stays the source of truth, and adding a ring to the web
 * without giving the app its art fails here rather than shipping as a
 * flat band nobody notices.
 */

const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/cosmetic-art.css"),
  "utf8",
);

/** Every slug of one family the stylesheet actually styles. */
function slugsIn(
  family: "ring" | "aura" | "pattern" | "bg" | "anim" | "scene",
): string[] {
  const found = css.matchAll(new RegExp(`\\.cfa-(${family}-[a-z0-9-]+)`, "g"));
  return [...new Set([...found].map((match) => match[1]))].sort();
}

describe("the ring table", () => {
  const slugs = slugsIn("ring");

  it("covers every ring the website styles", () => {
    expect(slugs.length).toBeGreaterThan(20);
    expect(Object.keys(RING_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("ring"))("%s turns at the web's own period", (slug) => {
    /* A ring that spins at 3.6s on a laptop and 5s on a phone is two
       different products with one name. */
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-ring-band::before\\s*\\{[^}]*animation:\\s*cfa-[a-z-]+\\s+([0-9.]+)s`,
      "m",
    ).exec(css);

    expect(RING_ART[slug].spinSeconds).toBe(rule ? Number(rule[1]) : null);
  });

  it.each(slugsIn("ring"))("%s has a sweep Skia will accept", (slug) => {
    const { colors, positions } = RING_ART[slug];

    /* Skia wants one position per colour, non-decreasing, spanning the
       whole turn. A gradient that stops short leaves a visible seam. */
    expect(colors.length).toBe(positions.length);
    expect(colors.length).toBeGreaterThan(1);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1);

    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }

    for (const colour of colors) {
      expect(colour).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\()/);
    }
  });

  it("keeps a hard-banded ring's stops paired", () => {
    /* CSS `#aaa 8% 16%` is a BAND, not a point, and it becomes two Skia
       stops at one colour. Frozen is the one that proves the converter
       understood the difference. */
    const frozen = RING_ART["ring-frozen"];

    expect(frozen.colors.length).toBeGreaterThan(10);
    expect(frozen.colors[1]).toBe(frozen.colors[0]);
  });
});

describe("the aura table", () => {
  it("covers every aura the website styles", () => {
    expect(Object.keys(AURA_ART).sort()).toEqual(slugsIn("aura"));
  });

  it.each(slugsIn("aura"))("%s moves at the web's own period", (slug) => {
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-aura-fx\\s*\\{[^}]*animation:\\s*cfa-([a-z-]+)\\s+([0-9.]+)s`,
      "m",
    ).exec(css);

    expect(rule).not.toBeNull();
    expect(AURA_ART[slug].seconds).toBe(Number(rule![2]));
    expect(AURA_ART[slug].motion).toBe(rule![1]);
  });

  it.each(slugsIn("aura"))("%s draws the shape the website scatters", (slug) => {
    /*
     * WHAT the particle is, not just how it moves. Every aura used to
     * be the same filled circle in a different colour, so Hearts
     * reached a real phone as a pink dot and Snow as a white one -
     * eight cosmetics drawn as one speck. The shape now comes out of
     * the stylesheet with the rest of the numbers, and the first
     * `--cfa-p-*` layer is the one that names the effect.
     */
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-aura-fx\\s*\\{[^}]*background-image:\\s*var\\(--cfa-p-([a-z-]+)\\)`,
      "m",
    ).exec(css);

    expect(rule).not.toBeNull();
    expect(AURA_ART[slug].shape).toBe(rule![1]);
  });

  it("has a drawn path for every shape in the table", () => {
    /* The data can name a shape the renderer has never heard of, and
       the fallback for that is the plain circle this whole change
       exists to get rid of. The generator refuses an unknown shape;
       this is the other half, read off the app's own source. */
    const worn = readFileSync(
      resolve(import.meta.dirname, "../../mobile/src/cosmetic-worn.tsx"),
      "utf8",
    );

    for (const slug of slugsIn("aura")) {
      expect(worn).toMatch(new RegExp(`\\b${AURA_ART[slug].shape}: \\{`));
    }
  });

  it.each(slugsIn("aura"))("%s draws a sensible number of particles", (slug) => {
    /* Every aura on screen is one shared clock, but the particles are
       still draw calls, and a room roster can hold a dozen avatars. */
    const art = AURA_ART[slug];

    expect(art.count).toBeGreaterThan(0);
    expect(art.count).toBeLessThanOrEqual(20);
    expect(art.opacity).toBeGreaterThan(0);
    expect(art.opacity).toBeLessThanOrEqual(1);
  });
});

/**
 * Holo patterns and showcase backgrounds: CSS background stacks, read
 * back as layers Skia can paint. The website lists a stack top first;
 * the app paints bottom first, so the table is reversed and the
 * stylesheet's LAST layer is the table's FIRST.
 */
const BLENDS = ["normal", "screen", "overlay", "colorDodge", "multiply", "luminosity"];
const MOTIONS = [
  "pan",
  "pan-y",
  "rise",
  "fall",
  "drift",
  "twinkle",
  "pulse",
  "flicker",
  "jitter",
  "hue",
];

function layersSound(layers: PaintLayer[]) {
  expect(layers.length).toBeGreaterThan(0);
  for (const layer of layers) {
    if ("colors" in layer) {
      expect(layer.colors.length).toBe(layer.positions.length);
      for (let i = 1; i < layer.positions.length; i += 1) {
        expect(layer.positions[i]).toBeGreaterThanOrEqual(layer.positions[i - 1]);
      }
    }
    if (layer.type === "texture") expect(TEXTURE_ART[layer.name]).toBeDefined();
    if ("place" in layer && layer.place) {
      for (const len of [layer.place.x, layer.place.y]) {
        expect(len === "auto" || "px" in len || "frac" in len).toBe(true);
      }
    }
  }
}

describe("the pattern table", () => {
  const slugs = slugsIn("pattern");

  it("covers every holo pattern the website styles", () => {
    expect(slugs.length).toBeGreaterThan(30);
    expect(Object.keys(PATTERN_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("pattern"))("%s blends and moves as the website does", (slug) => {
    const art = PATTERN_ART[slug];
    layersSound(art.layers);
    expect(BLENDS).toContain(art.blend);
    expect(art.opacity).toBeGreaterThan(0);
    expect(art.opacity).toBeLessThanOrEqual(1);

    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-card-fx\\s*\\{[^}]*animation:\\s*cfa-([a-z-]+)\\s+([0-9.]+)s`,
      "m",
    ).exec(css);
    if (rule) {
      expect(art.motion?.kind).toBe(rule[1]);
      expect(art.motion?.seconds).toBe(Number(rule[2]));
      expect(MOTIONS).toContain(rule[1]);
    } else {
      expect(art.motion).toBeNull();
    }
  });

  it("keeps the stylesheet's bottom layer first", () => {
    /* Galaxy: dots on top in CSS, three nebulae beneath. */
    const galaxy = PATTERN_ART["pattern-galaxy"].layers;
    expect(galaxy[galaxy.length - 1].type).toBe("texture");
    expect(galaxy[0].type).toBe("radial");
  });

  it("knows which patterns a phone can paint", () => {
    expect(hasPatternArt("pattern-classic-rainbow")).toBe(true);
    expect(hasPatternArt("pattern-hearts")).toBe(true);
    /* Text glyphs have no path to read back. */
    expect(hasPatternArt("pattern-matrix-rain")).toBe(false);
    expect(hasPatternArt(null)).toBe(false);
  });
});

describe("the background table", () => {
  const slugs = slugsIn("bg");

  it("covers every showcase background the website styles", () => {
    expect(slugs.length).toBeGreaterThan(25);
    expect(Object.keys(BACKGROUND_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("bg"))("%s is a stack Skia can paint", (slug) => {
    const art = BACKGROUND_ART[slug];
    layersSound(art.layers);
    if (art.motion) expect(MOTIONS).toContain(art.motion.kind);
  });

  it("reads a flat colour as its own layer, and the storm's flash", () => {
    expect(BACKGROUND_ART["bg-black-void"].layers).toEqual([
      { type: "solid", color: "#05060a" },
    ]);
    expect(BACKGROUND_ART["bg-lightning-storm"].flash?.seconds).toBe(5);
    expect(hasBackgroundArt("bg-sunset")).toBe(true);
  });
});

describe("the textures", () => {
  it("read every --cfa-p-* mark back as a path, bar the text glyphs", () => {
    const names = [...css.matchAll(/--cfa-p-([a-z0-9-]+):/g)].map((m) => m[1]);
    expect(Object.keys(TEXTURE_ART).sort()).toEqual([...new Set(names)].sort());
    for (const name of names) {
      const texture = TEXTURE_ART[name];
      expect(texture.viewBox.w).toBeGreaterThan(0);
      if (name === "glyph") {
        expect(texture.marks).toEqual([]);
        continue;
      }
      expect(texture.marks.length).toBeGreaterThan(0);
      for (const mark of texture.marks) {
        expect(mark.d).toMatch(/^M/);
        expect(mark.fill !== null || mark.stroke !== null).toBe(true);
      }
    }
  });
});

/**
 * The drawing and the wiring, read off the app's source.
 *
 * Node has no renderer, so this proves the pattern is written over the
 * face and the background under the shelf, not that a phone drew them;
 * the visual pass is mobile/TESTING.md. What it does catch is the two
 * ways this has gone wrong before: a layer rendered on the wrong side
 * of an opaque face, and a screen that quietly stopped passing a slug.
 */
describe("holo patterns and showcase backgrounds, in the app", () => {
  const app = (path: string) =>
    readFileSync(resolve(import.meta.dirname, "../../mobile/src", path), "utf8");
  const paint = app("cosmetic-paint.tsx");
  const card = app("cosmetic-card.tsx");
  const zoom = app("showcase-zoom.tsx");
  const own = app("screens/profile.tsx");
  const theirs = app("screens/player-profile.tsx");
  const customize = app("screens/customize.tsx");

  it("loads Skia guarded and deferred, like every other kit", () => {
    expect(paint).toMatch(
      /try \{\s*cached = makeKit\(require\("@shopify\/react-native-skia"\)\);/,
    );
    expect(paint).not.toMatch(/^import .* from "@shopify\/react-native-skia"/m);
  });

  it("caps a tiled layer so a zoomed screentone cannot drop frames", () => {
    expect(paint).toContain("const CELL_CAP = 900;");
    expect(paint).toMatch(/if \(cells <= CELL_CAP\) return tile;/);
  });

  it("builds texture paths once per kit, not per frame", () => {
    expect(paint).toMatch(/const TEXTURE = texturePaths\(S\);/);
    for (const name of Object.keys(TEXTURE_ART)) {
      /* Every mark the data names is reachable by the renderer. */
      expect(TEXTURE_ART[name].viewBox.w).toBeGreaterThan(0);
    }
  });

  it("draws the pattern over the art and the foil, under the effects", () => {
    const face = card.slice(
      card.indexOf("const face = ("),
      card.indexOf("const framed ="),
    );
    const pattern = face.indexOf("<WornPattern pattern={pattern}");
    expect(pattern).toBeGreaterThan(-1);
    expect(pattern).toBeGreaterThan(face.indexOf("<kit.Foil"));
    expect(pattern).toBeGreaterThan(face.indexOf("<RemoteImage"));
    expect(pattern).toBeLessThan(face.indexOf('effect === "shimmer"'));
    /* Sized to the face, inside the border, at the face's own radius. */
    expect(card).toContain("face(width - EDGE * 2, height - EDGE * 2, FACE_RADIUS)");
    expect(card).toContain("face(width, height, 6)");
  });

  it("dresses every showcase card, and only showcase cards", () => {
    /* The shelf, the add tile and the dressing sheet on your own
       profile; the shelf and the zoom on somebody else's. */
    expect(own.match(/pattern=\{profile\.equips\?\.pattern \?\? null\}/g)?.length).toBe(
      3,
    );
    expect(own.match(/pattern=\{pattern\}/g)?.length).toBe(2);
    expect(theirs).toContain("pattern={profile.equips?.pattern ?? null}");
    expect(theirs).toContain("pattern: profile.equips?.pattern ?? null,");
    expect(zoom).toContain("pattern={entry.pattern ?? null}");
    expect(zoom).toContain("pattern={shown.pattern ?? null}");

    /* The website dresses showcase cards and no others. */
    for (const file of [
      "screens/store.tsx",
      "player-peek.tsx",
      "dressing-picker.tsx",
    ]) {
      expect(app(file), `${file} dresses a card outside the showcase`).not.toContain(
        "pattern=",
      );
    }
  });

  it("paints the background first in a clipped, measured block", () => {
    /* No bordered panel since the profile IA round and no "Showcase"
       heading since the tabs round (the Showcase tab is the heading),
       but still one measured, clipped view with the background
       painted first and the shelf over it, on both screens. */
    for (const [source, shelf] of [
      [own, "profile.showcase.length === 0"],
      [theirs, "profile.showcase.length === 0"],
    ] as const) {
      const panel = source.slice(
        source.lastIndexOf("<View", source.indexOf("<WornBackground")),
      );
      const background = panel.indexOf("<WornBackground");
      expect(background).toBeGreaterThan(-1);
      expect(background).toBeLessThan(panel.indexOf(shelf));
      expect(panel.slice(0, background)).toContain('overflow: "hidden"');
      expect(panel.slice(0, background)).toContain("onLayout=");
      expect(panel).toContain("background={profile.equips?.background ?? null}");
    }
  });

  it("previews a pattern on a card and a background as a panel", () => {
    const preview = customize.slice(
      customize.indexOf("function CosmeticPreview"),
      customize.indexOf("const PREVIEW ="),
    );
    expect(preview).toMatch(/kind === "pattern" && drawsPattern\(slug\)/);
    expect(preview).toContain("pattern={slug}");
    expect(preview).toMatch(/kind === "background" && drawsBackground\(slug\)/);
    expect(preview).toContain("<WornBackground");
    expect(customize).toContain(
      "const SWATCH = { w: Math.round(PREVIEW * 1.6), h: PREVIEW };",
    );
  });
});

/**
 * Card animations and profile scenes, drawn in the app.
 *
 * Read off the source, as above: this proves the animation wraps the
 * whole card and its overlay sits on the face, the scene sits between
 * the cover and the controls, and the screens pass the slugs. The
 * keyframe arithmetic itself is tested in app-cosmetic-motion.test.ts.
 */
describe("card animations and profile scenes, in the app", () => {
  const app = (path: string) =>
    readFileSync(resolve(import.meta.dirname, "../../mobile/src", path), "utf8");
  const paint = app("cosmetic-paint.tsx");
  const motion = app("cosmetic-motion.ts");
  const keyframes = app("cosmetic-keyframes.ts");
  const card = app("cosmetic-card.tsx");
  const zoom = app("showcase-zoom.tsx");
  const own = app("screens/profile.tsx");
  const theirs = app("screens/player-profile.tsx");
  const customize = app("screens/customize.tsx");

  it("plays the tracks on one Reanimated clock per thing, never a timer", () => {
    /* The arithmetic runs on the UI thread; the clock is Reanimated's. */
    expect(keyframes).toContain('"worklet"');
    expect(keyframes).not.toMatch(/from "react/);
    expect(motion).toContain('from "./cosmetic-keyframes"');
    expect(motion).toMatch(/withRepeat\(/);
    /* A delay runs the clock up from below zero: at rest, as CSS's
       fill-mode none shows, then the loop. */
    expect(motion).toMatch(/withSequence\(/);
    expect(motion).toContain("clock.value = -delay / seconds;");
    expect(motion).not.toContain("setInterval");
    expect(motion).not.toContain("setTimeout");
    expect(keyframes).toContain("export const TILT_PERSPECTIVE = 600;");
    expect(paint).toContain('from "./cosmetic-motion"');
  });

  it("extends the round-10 renderer rather than starting another", () => {
    expect(paint).toContain("const CELL_CAP = 900;");
    expect(paint).toContain("const TEXTURE = texturePaths(S);");
    expect(paint).toMatch(/export function WornAnimation\(/);
    expect(paint).toMatch(/export function WornScene\(/);
    expect(paint).toMatch(/export function Sprite\(/);
    expect(paint).toMatch(/export function AnimationEdge\(/);
    expect(paint).toMatch(/export function TrackedView\(/);
    /* The new paint behaviours: the spotlight's wander, the arcs' edge
       band, the aurora's top band. */
    expect(paint).toContain("const WANDER_X = [0.18, 0.78, 0.45, 0.18];");
    expect(paint).toContain("const WANDER_Y = [0.3, 0.4, 0.75, 0.3];");
    expect(paint).toMatch(/invertClip/);
    expect(paint).toMatch(/clipHeight=\{height\}/);
    /* A sprite's glow is a blur behind it; a card's glows ride the
       card as box-shadows do. */
    expect(paint).toContain("<BlurMask");
    expect(paint).toMatch(/boxShadow: art\.card\.glows\.map/);
    expect(paint).toContain("{ perspective: TILT_PERSPECTIVE }");
  });

  it("wraps the whole card, draws over the face, and edges the flame", () => {
    /* The animation wraps the OUTER view, so float and tilt move the
       border too; the overlay is inset to the face. */
    const body = card.indexOf("const body = framed ?");
    const worn = card.indexOf("<WornAnimation", body);
    expect(body).toBeGreaterThan(-1);
    expect(worn).toBeGreaterThan(body);
    expect(card.slice(worn)).toContain("{body}");
    expect(card).toContain("inset={framed ? EDGE : hairline}");
    expect(card).toContain("faceRadius={framed ? FACE_RADIUS : 6 - hairline}");
    /* The flame's edge stands in for a border's, never over one. */
    expect(card).toContain(
      "const flame = edge === null && drawsAnimationEdge(animation);",
    );
    expect(card).toContain("<AnimationEdge animation={animation}");
    expect(card).toMatch(/edge \? \(\s*<CardEdge border=\{edge\}/);
  });

  it("dresses every showcase card, and only showcase cards", () => {
    expect(
      own.match(/animation=\{profile\.equips\?\.animation \?\? null\}/g)?.length,
    ).toBe(3);
    expect(own.match(/animation=\{animation\}/g)?.length).toBe(2);
    expect(theirs).toContain("animation={profile.equips?.animation ?? null}");
    expect(theirs).toContain("animation: profile.equips?.animation ?? null,");
    expect(zoom).toContain("animation={entry.animation ?? null}");
    expect(zoom).toContain("animation={shown.animation ?? null}");

    for (const file of [
      "screens/store.tsx",
      "player-peek.tsx",
      "dressing-picker.tsx",
    ]) {
      expect(app(file), `${file} animates a card outside the showcase`).not.toContain(
        "animation=",
      );
    }
  });

  it("lays the scene over the cover and under the controls of a measured block", () => {
    for (const source of [own, theirs]) {
      const scene = source.indexOf("<WornScene");
      expect(scene).toBeGreaterThan(-1);
      const block = source.slice(source.lastIndexOf("<Card", scene), scene);
      expect(block).toContain('overflow: "hidden"');
      expect(block).toContain("onLayout=");
      expect(block).toContain("<CoverBanner");
      /* The share icon is the first thing in the block that can be
         tapped; the scene must be beneath it. */
      expect(scene).toBeLessThan(source.indexOf("<ShareProfileIcon"));
      expect(source).toContain("scene={profile.equips?.scene ?? null}");
    }
  });

  it("previews an animation on a card and a scene over a mini profile", () => {
    const preview = customize.slice(
      customize.indexOf("function CosmeticPreview"),
      customize.indexOf("function ScenePreview"),
    );
    expect(preview).toMatch(/kind === "animation" && drawsAnimation\(slug\)/);
    expect(preview).toContain("animation={slug}");
    expect(preview).toMatch(
      /kind === "scene" && \(drawsScene\(slug\) \|\| SCENE_ART\[slug\]\?\.avatarTiming\)/,
    );
    expect(customize).toContain("<ScenePreview slug={slug} />");
    expect(customize).toContain("<WornScene scene={slug}");
    /* The avatar entrance pops the mini avatar, as the website's
       preview does, and the avatar is the website's 32px. */
    expect(customize).toContain("timings={avatarTiming ? [avatarTiming] : []}");
    expect(customize).toContain("const MINI_AVATAR = 32;");
    /* The honest note says what is true now, and nothing about Rive. */
    expect(customize).toContain("Everything in the catalogue draws here now.");
    expect(customize).not.toContain("Rive");
  });
});

/**
 * Card animations and profile scenes: motion of the whole card, an fx
 * layer over it, and sprites (the stylesheet's ::before / ::after) that
 * sweep, spin, ripple and streak. Every keyframe that moves a thing
 * (rather than its paint) is read back as a track of stops.
 */
function timingSound(timing: Timing | null) {
  if (!timing) return;
  expect(timing.seconds).toBeGreaterThan(0);
  expect(["linear", "ease", "ease-in", "ease-out", "ease-in-out", "steps"]).toContain(
    timing.easing,
  );
  /* A motion that moves a thing has a track; one that moves paint is a
     paint kind the renderer knows. Nothing else may be named. */
  const paintKinds = ["pan", "pan-y", "rise", "fall", "drift", "wander", "hue"];
  expect(timing.kind in MOTION_ART || paintKinds.includes(timing.kind)).toBe(true);
}

function spriteSound(sprite: SpriteArt) {
  for (const len of [
    sprite.box.top,
    sprite.box.left,
    sprite.box.width,
    sprite.box.height,
  ]) {
    expect(len === "auto" || "px" in len || "frac" in len).toBe(true);
  }
  expect(sprite.layers.length > 0 || sprite.border !== null).toBe(true);
  timingSound(sprite.timing);
}

describe("the motion tracks", () => {
  it("read every keyframe that moves or fades a thing", () => {
    for (const name of [
      "sheen",
      "tilt",
      "float",
      "breathe",
      "ripple",
      "shock",
      "spin",
      "streakthrough",
      "popin",
      "dealin",
      "burst",
      "glitch",
      "scan",
      "flash",
    ]) {
      expect(MOTION_ART[name]).toBeDefined();
    }
    for (const [name, stops] of Object.entries(MOTION_ART)) {
      expect(stops[0].at, name).toBe(0);
      expect(stops[stops.length - 1].at, name).toBe(1);
      for (let i = 1; i < stops.length; i += 1) {
        expect(stops[i].at).toBeGreaterThanOrEqual(stops[i - 1].at);
      }
    }
  });

  it("keeps the sheen's skew and the tilt's axis", () => {
    expect(MOTION_ART.sheen[0].skewX).toBe(-18);
    expect(MOTION_ART.tilt[1].tilt).toEqual({ x: -1, y: 1, deg: 7 });
    expect(MOTION_ART.spin).toEqual([{ at: 0 }, { at: 1, rotate: 360 }]);
  });
});

describe("the animation table", () => {
  const slugs = slugsIn("anim");

  it("covers every card animation the website styles", () => {
    expect(slugs.length).toBeGreaterThan(25);
    expect(Object.keys(ANIMATION_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("anim"))("%s is motion, paint or sprites Skia can play", (slug) => {
    const art = ANIMATION_ART[slug];
    for (const timing of art.card.timings) timingSound(timing);
    if (art.fx) {
      layersSound(art.fx.layers);
      timingSound(art.fx.timing);
    }
    for (const sprite of art.sprites) spriteSound(sprite);
  });

  it("reads the shared ripple rule for both rings, the second a beat behind", () => {
    const [first, second] = ANIMATION_ART["anim-ripple"].sprites;
    expect(first.border?.width).toBe(1.5);
    expect(second.border?.width).toBe(1.5);
    expect(first.timing?.delaySeconds).toBe(0);
    expect(second.timing?.delaySeconds).toBe(1.3);
    expect(first.round).toBe(true);
  });

  it("knows Still is still, and the rest move", () => {
    expect(hasAnimationArt("anim-still")).toBe(false);
    expect(hasAnimationArt("anim-float")).toBe(true);
    expect(hasAnimationArt("anim-shimmer")).toBe(true);
    expect(hasAnimationArt("anim-flame-edge")).toBe(true);
    expect(ANIMATION_ART["anim-flame-edge"].card.edge?.type).toBe("linear");
  });
});

describe("the scene table", () => {
  const slugs = slugsIn("scene");

  it("covers every profile scene the website styles", () => {
    expect(slugs.length).toBeGreaterThan(15);
    expect(Object.keys(SCENE_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("scene"))("%s is paint or sprites Skia can play", (slug) => {
    const art = SCENE_ART[slug];
    if (art.fx) {
      layersSound(art.fx.layers);
      timingSound(art.fx.timing);
    }
    for (const sprite of art.sprites) spriteSound(sprite);
  });

  it("says which scenes draw on a real profile", () => {
    expect(hasSceneArt("scene-snow")).toBe(true);
    expect(hasSceneArt("scene-shooting-stars")).toBe(true);
    /* The avatar entrance animates only the preview's mini avatar. */
    expect(hasSceneArt("scene-avatar-entrance")).toBe(false);
    expect(SCENE_ART["scene-avatar-entrance"].avatarTiming?.kind).toBe("popin");
    expect(SCENE_ART["scene-aurora"].fx?.height).toEqual({ frac: 0.44 });
  });
});

describe("what the app still approximates", () => {
  it("says so, rather than guessing", () => {
    /* A slug with no art must answer false, not throw. */
    expect(hasRingArt("ring-inferno")).toBe(true);
    expect(hasAuraArt("aura-sparks")).toBe(true);

    expect(hasRingArt("border-neon")).toBe(false);
    expect(hasAuraArt("pattern-holo")).toBe(false);
    expect(hasPatternArt("anim-sparkle")).toBe(false);
    expect(hasBackgroundArt("scene-rain")).toBe(false);
    expect(hasAnimationArt("pattern-prism")).toBe(false);
    expect(hasSceneArt(null)).toBe(false);
    expect(hasRingArt(null)).toBe(false);
    expect(hasAuraArt(null)).toBe(false);
  });
});
