/**
 * Turns the website's cosmetic stylesheet into the table the app draws
 * from.
 *
 *   npm run cosmetics:art
 *
 * WHY THIS EXISTS. The first two families a phone learned to draw -
 * rings and auras - were extracted out of `src/app/cosmetic-art.css`
 * by hand. Thirty-three cosmetics of hand-copied hex is thirty-three
 * chances to be subtly wrong about something somebody spent Embers on,
 * and there are two hundred and nineteen in the catalogue. Hand
 * extraction does not go there. This does.
 *
 * The stylesheet stays the source of truth. This reads it, converts
 * what CSS says into what Skia understands, and writes
 * `mobile/src/cosmetic-art-data.ts`. Nothing downstream is allowed to
 * transcribe a colour.
 *
 * THE THREE CONVERSIONS WORTH KNOWING ABOUT:
 *
 * 1. A CSS conic gradient is a Skia sweep gradient, and CSS's two stop
 *    syntaxes mean different things. Bare colours spread evenly;
 *    `#aaa 8% 16%` is a HARD BAND and becomes two Skia stops at one
 *    colour. That is why Frozen has twenty stops and Inferno has seven.
 *
 * 2. A card border's edge is a stack of background layers, painted
 *    last-first. The bottom layer is the gradient that gives the border
 *    its colour; anything above it is a repeating particle texture. We
 *    take the bottom layer as the base and record the texture's name
 *    without drawing it, so the app is honest about which borders are
 *    still missing their speckle.
 *
 * 3. An `inset` box-shadow is a hairline, not a glow. They are stored
 *    apart because they are drawn apart.
 *
 * WHAT IS NOT GENERATED. The aura table is CURATED, below, and only
 * verified against the stylesheet. CSS says how fast a particle field
 * moves; it cannot say how many particles a phone should draw, because
 * the web tiles a repeating image and a phone draws discrete specks.
 * Those counts were tuned by hand and stay that way; the generator
 * fails loudly if the motion or the period behind them drifts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = resolve(root, "src/app/cosmetic-art.css");
const OUT_PATH = resolve(root, "mobile/src/cosmetic-art-data.ts");

/* ---------------------------------------------------------------- */
/* Curation: the parts of a cosmetic CSS does not state              */
/* ---------------------------------------------------------------- */

/**
 * Particles per aura, and how big each one is.
 *
 * The web paints a tiled image and lets the tile decide; a phone draws
 * circles and has to be told. Tuned against the web at avatar size and
 * against what a room roster of a dozen can afford to draw.
 */
/**
 * The particle shapes the app can actually draw.
 *
 * NOT a curation - the shape itself is read out of the stylesheet, the
 * same as every other number here. This is only the list of the ones
 * `cosmetic-worn.tsx` has a Skia path for, so that a new `--cfa-p-*`
 * arriving in an aura fails the generator instead of silently coming
 * out as a plain dot on a phone. Every aura was a plain dot once, which
 * is how "Hearts" reached a real profile as a pink circle.
 */
const AURA_SHAPES = new Set([
  "heart",
  "petal",
  "spark",
  "star",
  "flake",
  "bubble",
  "bolt",
  "shard",
]);

const AURA_CURATION = {
  "aura-sparks": { colors: ["#ffd27a", "#ff8c2e"], count: 14, scale: 0.035 },
  "aura-bubbles": { colors: ["#bfe4ff", "#eaf7ff"], count: 11, scale: 0.05 },
  "aura-hearts": { colors: ["#ff8fb1", "#ffd0dd"], count: 10, scale: 0.045 },
  "aura-sakura": { colors: ["#ffc9dd", "#fff0f5"], count: 12, scale: 0.045 },
  "aura-holo-shards": { colors: ["#a5b4fc", "#7fe3d4"], count: 12, scale: 0.04 },
  "aura-snow": { colors: ["#eaf7ff", "#bfe4ff"], count: 14, scale: 0.035 },
  "aura-stars": { colors: ["#ffe08a", "#fff6d5"], count: 13, scale: 0.035 },
  "aura-static": { colors: ["#a5b4fc", "#eaf7ff"], count: 16, scale: 0.028 },
};

/* ---------------------------------------------------------------- */
/* A very small CSS reader                                           */
/* ---------------------------------------------------------------- */

const source = readFileSync(CSS_PATH, "utf8");
/* Comments first, or a selector inside a banner comment parses as a
   rule and every property on the real rule goes missing. */
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `selector { body }` in the sheet, in source order. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].trim().replace(/\s+/g, " "),
  body: match[2],
}));

/** One declaration's value, from the first rule whose selector matches. */
function decl(selector, property) {
  for (const rule of rules) {
    if (rule.selector !== selector) continue;
    const found = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, "m").exec(rule.body);
    if (found) return found[1].trim().replace(/\s+/g, " ");
  }
  return null;
}

/** Splits on `sep` at bracket depth zero, so rgba(...) survives. */
function splitTop(value, sep = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === sep && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** The inside of the outermost `name(...)`, or null. */
function inside(value, name) {
  const start = value.indexOf(`${name}(`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + name.length; i < value.length; i += 1) {
    if (value[i] === "(") depth += 1;
    if (value[i] === ")") {
      depth -= 1;
      if (depth === 0) return value.slice(start + name.length + 1, i);
    }
  }
  return null;
}

const round = (value) => Number(value.toFixed(4));

/**
 * CSS colour stops, as Skia's parallel colours and 0-1 positions.
 *
 * Implements the real rule rather than a convenient one: an unpositioned
 * stop is spread evenly between its nearest positioned neighbours, the
 * ends default to 0 and 1, and `<colour> <a> <b>` is two stops.
 */
function colorStops(tokens, unit, { extend = true } = {}) {
  const entries = [];

  for (const token of tokens) {
    /*
     * SPLIT ON SPACES, never scanned for numbers. A stop is a colour
     * and up to two positions - `#ef3ef0 32% 55%` - and scanning it for
     * a trailing bare zero finds one at the end of `#ef3ef0`, turns the
     * colour into `#ef3ef`, and invents a stop at the top of the sweep.
     * Glitch and Aurora both shipped that way for about ten minutes.
     */
    const parts = splitTop(token, " ");
    const color = parts[0];
    const rest = parts.slice(1);

    if (rest.length === 0) entries.push({ color, at: null });
    else
      for (const part of rest) {
        const measure = fraction(part, unit);
        if (measure !== null) entries.push({ color, at: measure });
      }
  }

  if (entries.length === 0) return null;

  /* Pixel stops are a PERIOD rather than a fraction - one run of a
     repeating gradient - so they normalise against the longest and the
     period travels separately for the app to tile with. */
  let period = null;
  if (unit === "px") {
    period = Math.max(...entries.map((entry) => entry.at ?? 0));
    if (period > 0) {
      for (const entry of entries) {
        if (entry.at !== null) entry.at /= period;
      }
    }
  }

  if (entries[0].at === null) entries[0].at = 0;
  if (entries[entries.length - 1].at === null) {
    entries[entries.length - 1].at = 1;
  }

  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].at !== null) continue;
    let end = i;
    while (entries[end].at === null) end += 1;
    const from = entries[i - 1].at;
    const span = entries[end].at - from;
    for (let k = i; k < end; k += 1) {
      entries[k].at = from + (span * (k - i + 1)) / (end - i + 1);
    }
    i = end;
  }

  /* Skia refuses a decreasing stop list. CSS clamps instead. */
  for (let i = 1; i < entries.length; i += 1) {
    entries[i].at = Math.max(entries[i].at, entries[i - 1].at);
  }

  /*
   * CSS lets a gradient stop short and holds the last colour to the
   * end; Skia wants the whole range described. Meteor ends at 97% and
   * stays dark navy for the last 3%, which as a bare stop list is a
   * sweep with a seam in it.
   *
   * NOT for a repeating gradient, whose last stop is the length of one
   * wedge and is about to be tiled. Padding it to 1 first makes the
   * wedge look like the whole turn and the tiling silently does
   * nothing.
   */
  if (extend) {
    if (entries[0].at > 0) {
      entries.unshift({ color: entries[0].color, at: 0 });
    }
    if (entries[entries.length - 1].at < 1) {
      entries.push({ color: entries[entries.length - 1].color, at: 1 });
    }
  }

  return {
    colors: entries.map((entry) => entry.color),
    positions: entries.map((entry) => round(entry.at)),
    period,
  };
}

/**
 * One position token as a 0-1 fraction of the gradient it belongs to.
 *
 * The unit on the token wins; a bare number falls back to whatever the
 * gradient is measured in, which is how `#bfe4ff 0 8%` and
 * `#0b0d11 0deg 7deg` both start at the very beginning. Getting this
 * wrong once put a whole repeating sweep at position 1.94.
 */
function fraction(token, gradientUnit) {
  const found = /^(-?[0-9.]+)(%|px|deg)?$/.exec(token);
  if (!found) return null;

  const value = Number(found[1]);
  switch (found[2] ?? gradientUnit) {
    case "%":
      return value / 100;
    case "deg":
      return value / 360;
    default:
      /* Pixels stay as pixels until the period is known. */
      return value;
  }
}

/** One wedge of a repeating sweep, laid end to end around the turn. */
function tile(stops) {
  const period = stops.positions[stops.positions.length - 1];
  if (!period || period >= 1) return stops;

  const colors = [];
  const positions = [];

  for (let turn = 0; turn * period < 1; turn += 1) {
    for (let i = 0; i < stops.colors.length; i += 1) {
      /*
       * The wedge's last stop and the next wedge's first sit at the
       * same angle in DIFFERENT colours, and that coincidence is the
       * hard edge - Manga's black meeting Manga's white. Dropping one
       * as a duplicate turns every stripe boundary into a soft blend
       * and the ring into a smear.
       */
      const at = turn * period + stops.positions[i];
      if (at > 1) break;
      colors.push(stops.colors[i]);
      positions.push(round(at));
    }
  }

  if (positions[positions.length - 1] < 1) {
    colors.push(colors[colors.length - 1]);
    positions.push(1);
  }

  return { colors, positions, period: null };
}

/** `160deg` / `to right` as degrees, CSS's convention: 0 is up. */
function angleOf(token) {
  const deg = /^(-?[0-9.]+)deg$/.exec(token);
  if (deg) return Number(deg[1]);
  if (/^to /.test(token)) {
    const named = {
      "to top": 0,
      "to right": 90,
      "to bottom": 180,
      "to left": 270,
      "to top right": 45,
      "to bottom right": 135,
      "to bottom left": 225,
      "to top left": 315,
    };
    return named[token] ?? 180;
  }
  return null;
}

/** `0 0 12px rgba(...)` from a box-shadow, split from insets. */
function shadows(value) {
  let glow = null;
  let hairline = null;
  if (!value) return { glow, hairline };

  for (const layer of splitTop(value)) {
    const isInset = /^inset\b/.test(layer);
    const color = /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(layer);
    if (!color) continue;

    /*
     * The lengths, in order: x, y, blur, spread. Taken as TOKENS rather
     * than by hunting for `px`, because `0 0 10px rgba(...)` writes its
     * zeros without a unit - and matching only the `px` ones made the
     * blur look like the x offset, so every glow in the catalogue came
     * out null and forty-three borders lost their halo.
     */
    const lengths = layer
      .replace(color[0], " ")
      .replace(/\binset\b/, " ")
      .trim()
      .split(/\s+/)
      .map((token) => Number(token.replace("px", "")))
      .filter((value) => !Number.isNaN(value));

    if (isInset) {
      hairline = { color: color[1], width: lengths[3] || lengths[2] || 1 };
    } else if ((lengths[2] ?? 0) > 0) {
      glow = { color: color[1], radius: lengths[2] };
    }
  }
  return { glow, hairline };
}

/** `cfa-pan 5s linear infinite alternate` from an animation shorthand. */
function motionOf(value) {
  if (!value) return null;
  const found = /cfa-([a-z-]+)\s+([0-9.]+)s/.exec(value);
  if (!found) return null;
  return {
    kind: found[1],
    seconds: Number(found[2]),
    alternate: /\balternate\b/.test(value),
  };
}

/* ---------------------------------------------------------------- */
/* Families                                                          */
/* ---------------------------------------------------------------- */

/** Every slug of one family the stylesheet actually styles. */
function slugsOf(prefix) {
  const found = css.matchAll(new RegExp(`\\.cfa-(${prefix}-[a-z0-9-]+)`, "g"));
  return [...new Set([...found].map((match) => match[1]))].sort();
}

function rings() {
  const out = {};

  for (const slug of slugsOf("ring")) {
    const band = decl(`.cfa-${slug}`, "--cfa-band");
    if (!band) throw new Error(`${slug} has no --cfa-band`);

    const repeating = inside(band, "repeating-conic-gradient");
    const conic = repeating ?? inside(band, "conic-gradient");
    if (!conic) throw new Error(`${slug}'s band is not a conic gradient`);

    const tokens = splitTop(conic);
    /* `from 0deg` leads some sweeps; it is a rotation, and the app
       rotates the whole canvas anyway. */
    if (/^from /.test(tokens[0])) tokens.shift();

    /* Repeating sweeps are written in degrees for one wedge - Manga is
       twenty degrees of black and white and then "again". Skia has a
       repeat tile mode, but a sweep gradient with the whole turn spelt
       out needs nothing clever at the drawing end, so the wedge is
       tiled here instead. */
    const unit = /\d+deg/.test(conic) ? "deg" : "%";
    const stops = repeating
      ? tile(colorStops(tokens, unit, { extend: false }))
      : colorStops(tokens, unit);
    const spin = motionOf(decl(`.cfa-${slug} .cfx-ring-band::before`, "animation"));
    const filter = decl(`.cfa-${slug} .cfx-ring-band`, "filter");
    /* Several rings stack two drop-shadows: a tight inner one and a
       wide outer one. The wide one is the glow anybody sees, so the
       widest wins rather than the first. */
    const glow = filter
      ? ([...filter.matchAll(/drop-shadow\(([^()]*(?:\([^)]*\)[^()]*)*)\)/g)]
          .map((match) => ({
            color: /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(match[1])?.[1] ?? null,
            radius: Number(/([0-9.]+)px/.exec(match[1])?.[1] ?? 0),
          }))
          .filter((shadow) => shadow.color && shadow.radius > 0)
          .sort((a, b) => b.radius - a.radius)[0] ?? null)
      : null;

    out[slug] = {
      colors: stops.colors,
      positions: stops.positions,
      spinSeconds: spin ? spin.seconds : null,
      glow,
    };
  }
  return out;
}

function auras() {
  const out = {};

  for (const slug of slugsOf("aura")) {
    const curated = AURA_CURATION[slug];
    if (!curated) {
      throw new Error(
        `${slug} is new. Add its particle count and scale to ` +
          `AURA_CURATION in scripts/extract-cosmetic-art.mjs - CSS ` +
          `tiles an image and cannot say how many a phone should draw.`,
      );
    }

    const fx = `.cfa-${slug} .cfx-aura-fx`;
    const motion = motionOf(decl(fx, "animation"));
    if (!motion) throw new Error(`${slug} has no aura animation`);

    /*
     * WHAT the particle is, not just how it moves. The web layers two
     * tiles - `var(--cfa-p-heart), var(--cfa-p-heart)` - and the first
     * is the one that names the effect. Stars layer a star over a dot;
     * the star is the point of it.
     */
    const layers = decl(fx, "background-image");
    const shape = /var\(--cfa-p-([a-z-]+)\)/.exec(layers ?? "")?.[1] ?? null;
    if (!shape) throw new Error(`${slug} has no particle image`);
    if (!AURA_SHAPES.has(shape)) {
      throw new Error(
        `${slug} draws --cfa-p-${shape}, which the app has no path for. ` +
          `Add one to PARTICLE in mobile/src/cosmetic-worn.tsx and list ` +
          `it in AURA_SHAPES here, or it ships as a plain dot.`,
      );
    }

    out[slug] = {
      motion: motion.kind,
      seconds: motion.seconds,
      opacity: Number(decl(fx, "opacity") ?? 1),
      shape,
      colors: curated.colors,
      count: curated.count,
      scale: curated.scale,
    };
  }
  return out;
}

function borders() {
  const out = {};

  for (const slug of slugsOf("border")) {
    const edge = decl(`.cfa-${slug}`, "--cfa-edge");
    if (!edge) throw new Error(`${slug} has no --cfa-edge`);

    /* Background layers paint front to back, so the LAST one is the
       colour underneath and everything before it is texture. */
    const layers = splitTop(edge);
    const base = layers[layers.length - 1];
    const textures = layers
      .slice(0, -1)
      .map((layer) => /var\(\s*(--cfa-p-[a-z0-9-]+)/.exec(layer)?.[1])
      .filter(Boolean);

    /* Lightning and Galaxy carry their speckle on a ::after rule rather
       than in the edge stack, and reading only the edge made those two
       look like plain gradients with nothing missing. */
    for (const rule of rules) {
      if (!rule.selector.startsWith(`.cfa-${slug}::`)) continue;
      const extra = /var\(\s*(--cfa-p-[a-z0-9-]+)/.exec(rule.body);
      if (extra && !textures.includes(extra[1])) textures.push(extra[1]);
    }

    let paint = null;
    const repeating = inside(base, "repeating-linear-gradient");
    const linear = repeating ?? inside(base, "linear-gradient");
    const radial = inside(base, "radial-gradient");

    if (linear) {
      const tokens = splitTop(linear);
      const angle = angleOf(tokens[0]);
      if (angle !== null) tokens.shift();
      const unit = /\d+px/.test(linear) ? "px" : "%";
      const stops = colorStops(tokens, unit, { extend: !repeating });
      paint = {
        type: repeating ? "repeat" : "linear",
        angle: angle ?? 180,
        colors: stops.colors,
        positions: stops.positions,
        ...(repeating ? { periodPx: stops.period ?? 16 } : {}),
      };
    } else if (radial) {
      const tokens = splitTop(radial);
      const shape = tokens.shift();
      const at = /at\s+([0-9.]+)%\s+([0-9.]+)%/.exec(shape);
      const size = [...shape.matchAll(/([0-9.]+)%/g)].map((m) => Number(m[1]) / 100);
      const stops = colorStops(tokens, "%");
      paint = {
        type: "radial",
        /* Skia's radial is a circle; a CSS ellipse averages to one. */
        cx: at ? Number(at[1]) / 100 : 0.5,
        cy: at ? Number(at[2]) / 100 : 0.5,
        radius: size.length >= 2 ? (size[0] + size[1]) / 2 : 0.7,
        colors: stops.colors,
        positions: stops.positions,
      };
    } else {
      /* A flat colour edge. Rare, and it still has to draw. */
      const flat = /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(base);
      if (!flat) throw new Error(`${slug}'s edge is not a gradient: ${base}`);
      paint = {
        type: "linear",
        angle: 180,
        colors: [flat[1], flat[1]],
        positions: [0, 1],
      };
    }

    const { glow, hairline } = shadows(decl(`.cfa-${slug}`, "box-shadow"));
    const motion = motionOf(decl(`.cfa-${slug}`, "animation"));
    const size = decl(`.cfa-${slug}`, "background-size");
    const spread = size
      ? (() => {
          const percents = [...size.matchAll(/([0-9.]+)%/g)].map((m) =>
            Number(m[1] / 100),
          );
          return percents.length >= 2 ? { x: percents[0], y: percents[1] } : null;
        })()
      : null;

    out[slug] = {
      base: paint,
      glow,
      hairline,
      motion,
      spread,
      textures,
    };
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Emit                                                              */
/* ---------------------------------------------------------------- */

/**
 * `text-shadow`'s layers, kept as data rather than judged here.
 *
 * A soft zero-offset layer is a glow; a hard offset layer is the web's
 * way of drawing pixel-art depth or a manga outline. The app decides
 * which is which at draw time - React Native's Text carries exactly one
 * shadow, so what cannot be drawn is at least named.
 */
function textShadows(value) {
  if (!value) return [];

  return splitTop(value)
    .map((layer) => {
      const color = /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/.exec(layer);
      if (!color) return null;
      const lengths = layer
        .replace(color[0], " ")
        .trim()
        .split(/\s+/)
        .map((token) => Number(token.replace("px", "")))
        .filter((number) => !Number.isNaN(number));

      return {
        x: lengths[0] ?? 0,
        y: lengths[1] ?? 0,
        blur: lengths[2] ?? 0,
        color: color[1],
      };
    })
    .filter(Boolean);
}

/**
 * How a name is filled: one colour, or a gradient clipped to the glyphs.
 *
 * The gradient case is the reason nameplates need Skia in the app -
 * there is no `background-clip: text` in React Native, so the honest
 * version draws the glyphs with a gradient shader.
 */
function names() {
  const out = {};

  for (const slug of slugsOf("name")) {
    const sel = `.cfa-${slug}.cfx-name`;
    const background = decl(sel, "background");
    const gradient = background ? inside(background, "linear-gradient") : null;

    let fill;
    if (gradient) {
      const tokens = splitTop(gradient);
      const angle = angleOf(tokens[0]);
      if (angle !== null) tokens.shift();
      const stops = colorStops(tokens, "%");
      const size = decl(sel, "background-size");
      const spread = size ? Number(/([0-9.]+)%/.exec(size)?.[1] ?? 100) / 100 : 1;
      fill = {
        type: "gradient",
        angle: angle ?? 180,
        colors: stops.colors,
        positions: stops.positions,
        /* background-size 300% is what lets cfa-pan travel: the paint
           is three names wide and slides. 1 for a gradient that just
           sits. */
        spread,
      };
    } else {
      fill = { type: "solid", color: decl(sel, "color") ?? "#f2f5f7" };
    }

    /* A glow can arrive as text-shadow on a solid fill or drop-shadow
       on a clipped one - clipped text has no text-shadow that follows
       the glyphs, so the web uses filter there. Same answer either way. */
    const layered = textShadows(decl(sel, "text-shadow"));
    const filter = decl(sel, "filter");
    const drop = filter ? inside(filter, "drop-shadow") : null;
    if (drop) {
      const parsed = textShadows(drop);
      if (parsed.length) layered.push(parsed[0]);
    }

    const family = decl(sel, "font-family") ?? "";
    const stroke = decl(sel, "-webkit-text-stroke");
    const strokeMatch = stroke
      ? /([0-9.]+)px\s+(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/.exec(stroke)
      : null;

    out[slug] = {
      fill,
      shadows: layered,
      font: /monospace/.test(family) ? "mono" : /serif/.test(family) ? "serif" : "sans",
      italic: (decl(sel, "font-style") ?? "") === "italic",
      letterSpacingEm:
        Number(/([0-9.]+)em/.exec(decl(sel, "letter-spacing") ?? "")?.[1] ?? 0) || null,
      stroke: strokeMatch
        ? { width: Number(strokeMatch[1]), color: strokeMatch[2] }
        : null,
      motion: motionOf(decl(sel, "animation")),
    };
  }
  return out;
}

/** A badge: a gradient pill, its glow, and the ink on it. */
function badges() {
  const out = {};

  for (const slug of slugsOf("badge")) {
    const sel = `.cfa-${slug}.cfx-badge`;
    const background = decl(sel, "background");
    const gradient = background ? inside(background, "linear-gradient") : null;
    if (!gradient) throw new Error(`${slug} has no gradient pill`);

    const tokens = splitTop(gradient);
    const angle = angleOf(tokens[0]);
    if (angle !== null) tokens.shift();
    const stops = colorStops(tokens, "%");
    const { glow } = shadows(decl(sel, "box-shadow"));

    out[slug] = {
      angle: angle ?? 140,
      colors: stops.colors,
      positions: stops.positions,
      glow,
      /* The scaffold's dark ink unless the rule says otherwise - the
         bronze badge is the one that does. */
      textColor: decl(sel, "color"),
    };
  }
  return out;
}

/** A title chip: the scaffold recoloured, occasionally glowing. */
function titles() {
  const out = {};

  for (const slug of slugsOf("title")) {
    const sel = `.cfa-${slug}.cfx-title-chip`;

    out[slug] = {
      borderColor: decl(sel, "border-color"),
      color: decl(sel, "color"),
      italic: (decl(sel, "font-style") ?? "") === "italic",
      shadows: textShadows(decl(sel, "text-shadow")),
      motion: motionOf(decl(sel, "animation")),
    };
  }
  return out;
}

const RING = rings();
const AURA = auras();
const BORDER = borders();
const NAME = names();
const BADGE = badges();
const TITLE = titles();

/** JSON, but as the TypeScript literal prettier would have written. */
const literal = (value) =>
  JSON.stringify(value).replace(/"([a-zA-Z][a-zA-Z0-9]*)":/g, "$1:");

const banner = `/**
 * What a worn cosmetic is made of, as data a phone can draw.
 *
 * GENERATED by scripts/extract-cosmetic-art.mjs from
 * src/app/cosmetic-art.css. Do not edit by hand - run
 * \`npm run cosmetics:art\`. The stylesheet stays the source of truth,
 * because a ring that spins at 3.6s on a laptop and 5s on a phone is
 * two different products with one name.
 *
 * The website draws all of this in CSS: conic gradients spun by
 * keyframes, drop-shadow glows, tiled particle layers, stacked
 * background images. React Native has none of it, so the app redraws
 * the same descriptions with Skia. \`tests/unit/app-cosmetic-art.test.ts\`
 * reads the stylesheet independently and fails when the two drift.
 *
 * Particle counts for auras are TUNED, not derived, and live in the
 * generator - CSS tiles an image and cannot say how many discrete
 * specks a phone should draw.
 */`;

const body = `${banner}

export type AuraMotion = "rise" | "fall" | "drift" | "twinkle" | "flicker";

/** The particle shapes, one Skia path each in \`cosmetic-worn.tsx\`. */
export type AuraShape =
  | "heart"
  | "petal"
  | "spark"
  | "star"
  | "flake"
  | "bubble"
  | "bolt"
  | "shard";

/** One ring's art. \`spinSeconds\` null means it does not turn. */
export interface RingArt {
  colors: string[];
  /** Matching 0-1 positions around the sweep. Same length as \`colors\`. */
  positions: number[];
  spinSeconds: number | null;
  glow: { color: string; radius: number } | null;
}

export interface AuraArt {
  motion: AuraMotion;
  seconds: number;
  opacity: number;
  /** WHAT is drawn: the \`--cfa-p-*\` the stylesheet scatters. */
  shape: AuraShape;
  /** Drawn per particle. Two colours alternate, as the CSS layers two. */
  colors: [string, string];
  /** How many particles orbit the picture. */
  count: number;
  /** Particle radius as a fraction of the avatar's size. */
  scale: number;
}

/** How a border's edge is painted, under whatever texture it carries. */
export type BorderPaint =
  | {
      type: "linear";
      /** CSS degrees: 0 points up, 90 points right. */
      angle: number;
      colors: string[];
      positions: number[];
    }
  | {
      type: "repeat";
      angle: number;
      colors: string[];
      positions: number[];
      /** One full run of the stops, in points. */
      periodPx: number;
    }
  | {
      type: "radial";
      /** Centre as a fraction of the card. */
      cx: number;
      cy: number;
      /** Radius as a fraction of the card's longest side. */
      radius: number;
      colors: string[];
      positions: number[];
    };

/** What moves, and how fast. \`null\` for a border that holds still. */
export interface BorderMotion {
  kind: string;
  seconds: number;
  alternate: boolean;
}

export interface BorderArt {
  base: BorderPaint;
  /** The web's outer \`box-shadow\`, which Skia spells as a blur. */
  glow: { color: string; radius: number } | null;
  /** An \`inset\` box-shadow: a hairline on the edge, not a glow. */
  hairline: { color: string; width: number } | null;
  motion: BorderMotion | null;
  /** \`background-size\` when the edge is oversized so it can pan. */
  spread: { x: number; y: number } | null;
  /**
   * Particle textures layered over the base, which the app does not
   * draw yet. Named rather than dropped, so what is missing from a
   * border on a phone is a fact in the data instead of a surprise.
   */
  textures: string[];
}

export const RING_ART: Record<string, RingArt> = ${literal(RING)};

export const AURA_ART: Record<string, AuraArt> = ${literal(AURA)};

export const BORDER_ART: Record<string, BorderArt> = ${literal(BORDER)};

/** One text-shadow layer. Zero-offset soft = glow; offset hard = depth. */
export interface TextShadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

/** How a username is drawn when a name style is worn. */
export interface NameArt {
  fill:
    | { type: "solid"; color: string }
    | {
        type: "gradient";
        angle: number;
        colors: string[];
        positions: number[];
        /** How many name-widths of paint there are; >1 means it pans. */
        spread: number;
      };
  shadows: TextShadow[];
  font: "sans" | "mono" | "serif";
  italic: boolean;
  letterSpacingEm: number | null;
  stroke: { width: number; color: string } | null;
  motion: BorderMotion | null;
}

/** A badge's pill: gradient, glow and ink. */
export interface BadgeArt {
  angle: number;
  colors: string[];
  positions: number[];
  glow: { color: string; radius: number } | null;
  /** Ink on the pill, or null for the scaffold's dark default. */
  textColor: string | null;
}

/** A title chip's recolouring of the scaffold. */
export interface TitleArt {
  borderColor: string | null;
  color: string | null;
  italic: boolean;
  shadows: TextShadow[];
  motion: BorderMotion | null;
}

export const NAME_ART: Record<string, NameArt> = ${literal(NAME)};

export const BADGE_ART: Record<string, BadgeArt> = ${literal(BADGE)};

export const TITLE_ART: Record<string, TitleArt> = ${literal(TITLE)};

/** Whether a phone can draw this slug rather than approximating it. */
export function hasRingArt(slug: string | null): boolean {
  return Boolean(slug && slug in RING_ART);
}

export function hasAuraArt(slug: string | null): boolean {
  return Boolean(slug && slug in AURA_ART);
}

export function hasBorderArt(slug: string | null): boolean {
  return Boolean(slug && slug in BORDER_ART);
}

export function hasNameArt(slug: string | null): boolean {
  return Boolean(slug && slug in NAME_ART);
}

export function hasBadgeArt(slug: string | null): boolean {
  return Boolean(slug && slug in BADGE_ART);
}

export function hasTitleArt(slug: string | null): boolean {
  return Boolean(slug && slug in TITLE_ART);
}
`;

writeFileSync(OUT_PATH, body);
console.log(
  `cosmetic art: ${Object.keys(RING).length} rings, ` +
    `${Object.keys(AURA).length} auras, ${Object.keys(BORDER).length} borders, ` +
    `${Object.keys(NAME).length} names, ${Object.keys(BADGE).length} badges, ` +
    `${Object.keys(TITLE).length} titles -> mobile/src/cosmetic-art-data.ts`,
);
