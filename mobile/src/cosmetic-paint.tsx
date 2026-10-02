import { useEffect, useMemo } from "react";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  BACKGROUND_ART,
  PATTERN_ART,
  TEXTURE_ART,
  hasBackgroundArt,
  hasPatternArt,
  type BorderMotion,
  type Len,
  type PaintBlend,
  type PaintLayer,
  type Placement,
  type TextureMark,
} from "./cosmetic-art-data";

/**
 * Holo patterns and showcase backgrounds, drawn on a phone.
 *
 * The web paints both as CSS background stacks: a list of gradients,
 * tiled SVG marks and the brand mark, each at its own position and
 * size, moved by keyframes and blended over the card. React Native has
 * none of that, so `cosmetic-art-data.ts` carries the stacks as data
 * and this file paints them with Skia - the same bargain the foil, the
 * worn ring and the card border make, and the same guarded, deferred
 * require, so a binary without Skia keeps the plain card and the plain
 * panel instead of failing to launch.
 *
 * One renderer for both families. A pattern is a stack over a card
 * face with a blend mode; a background is a stack behind a shelf with
 * a hairline and sometimes a flash. Nothing in here knows which it is
 * drawing beyond those props.
 */

type Skia = typeof import("@shopify/react-native-skia");

/** The one picture the stylesheet tiles: the brand mark. */
const MARK = require("../assets/cardflare-mark.png");

/**
 * The most cells one tiled layer may draw.
 *
 * A 6-point screentone over a 300-point zoomed card is 2,500 circles,
 * and a checkerboard is a gradient shader per cell. Past this many the
 * tile is scaled up to fit, so a dense pattern reads a little coarser
 * at zoom rather than dropping frames. Nine shelf cards at 56 points
 * never come near it.
 */
const CELL_CAP = 900;

/** How far the website's tiled layers travel in one cycle, in points. */
const FALL_DISTANCE = 220;
const DRIFT_DISTANCE = { x: 140, y: 160 };

/** The kinds that move the layers; everything else changes opacity or holds. */
const TRAVELS = new Set(["pan", "pan-y", "fall", "rise", "drift"]);

interface Box {
  w: number;
  h: number;
}

/** A resolved placement: one tile, in box coordinates. */
interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  repeat: boolean;
}

/** The region a layer must cover so its motion never shows an edge. */
interface Cover {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** CSS's gradient line: 0deg points up, and degrees run clockwise. */
function direction(angle: number): { dx: number; dy: number } {
  const radians = (angle * Math.PI) / 180;
  return { dx: Math.sin(radians), dy: -Math.cos(radians) };
}

/** The length of CSS's gradient line across a box at this angle. */
function lineLength(angle: number, box: Box): number {
  const { dx, dy } = direction(angle);
  return Math.abs(box.w * dx) + Math.abs(box.h * dy);
}

/** Skia reads "transparent" as a colour name; CSS fades to it in
    premultiplied space, which the gradient `flags` ask for below. */
function paintColor(color: string): string {
  return color === "transparent" ? "rgba(0,0,0,0)" : color;
}

function length(value: Len, whole: number): number | null {
  if (value === "auto") return null;
  return "px" in value ? value.px : value.frac * whole;
}

/**
 * Where one layer sits, from its CSS position / size / repeat.
 *
 * Percent positions follow CSS: the layer's p point meets the box's p
 * point, so `left = (boxW - layerW) * p`. "auto" keeps the mark's own
 * aspect against the other side, which is why a texture or an image
 * hands its aspect in.
 */
function resolvePlace(place: Placement | null, box: Box, aspect: number | null): Tile {
  if (!place) return { x: 0, y: 0, w: box.w, h: box.h, repeat: false };

  let w = place.w === null ? box.w : length(place.w, box.w);
  let h = place.h === null ? box.h : length(place.h, box.h);
  if (w === null && h === null) {
    w = box.w;
    h = box.h;
  } else if (w === null) {
    w = aspect ? (h as number) / aspect : box.w;
  } else if (h === null) {
    h = aspect ? w * aspect : box.h;
  }

  const x =
    place.x === "auto" ? 0 : "px" in place.x ? place.x.px : (box.w - w) * place.x.frac;
  const y =
    place.y === "auto"
      ? 0
      : "px" in place.y
        ? place.y.px
        : (box.h - (h as number)) * place.y.frac;

  return { x, y, w, h: h as number, repeat: place.repeat };
}

/**
 * The tile, scaled up if tiling it over `cover` would pass CELL_CAP.
 * Both sides scale alike so the mark keeps its shape.
 */
function capTile(tile: Tile, cover: Cover): Tile {
  if (!tile.repeat || tile.w <= 0 || tile.h <= 0) return tile;
  const across = Math.ceil((cover.x1 - cover.x0) / tile.w) + 1;
  const down = Math.ceil((cover.y1 - cover.y0) / tile.h) + 1;
  const cells = across * down;
  if (cells <= CELL_CAP) return tile;
  const scale = Math.sqrt(cells / CELL_CAP);
  return { ...tile, w: tile.w * scale, h: tile.h * scale };
}

/** A whole number of tiles nearest `distance`, so a loop meets itself. */
function snap(distance: number, tile: number): number {
  if (tile <= 0) return distance;
  return Math.max(1, Math.round(distance / tile)) * tile;
}

/**
 * How far a tiled layer travels in one cycle.
 *
 * The website pans `background-position` to 200%, which for a layer
 * wider than its box is a slide to the left and for a tile narrower
 * than the box a slide to the right; it falls and rises 220 points and
 * drifts 140 by 160. Every distance is snapped to whole tiles so a
 * looping layer wraps onto itself instead of jumping at the seam.
 */
function travelFor(kind: string, tile: Tile, box: Box): { x: number; y: number } {
  switch (kind) {
    case "pan":
      return { x: (tile.w > box.w ? -1 : 1) * snap(box.w, tile.w), y: 0 };
    case "pan-y":
      return { x: 0, y: (tile.h > box.h ? 1 : -1) * snap(box.h, tile.h) };
    case "fall":
      return { x: 0, y: snap(FALL_DISTANCE, tile.h) };
    case "rise":
      return { x: 0, y: -snap(FALL_DISTANCE, tile.h) };
    case "drift":
      return { x: -snap(DRIFT_DISTANCE.x, tile.w), y: -snap(DRIFT_DISTANCE.y, tile.h) };
    default:
      return { x: 0, y: 0 };
  }
}

/** The box, grown so a layer sliding by `travel` never shows an edge. */
function coverFor(box: Box, travel: { x: number; y: number }, pad: number): Cover {
  return {
    x0: -pad - Math.max(0, travel.x),
    y0: -pad - Math.max(0, travel.y),
    x1: box.w + pad + Math.max(0, -travel.x),
    y1: box.h + pad + Math.max(0, -travel.y),
  };
}

/** Every cell of a tile across the cover, or the one tile when it does not repeat. */
function cellsOf(tile: Tile, cover: Cover): { x: number; y: number }[] {
  if (!tile.repeat) return [{ x: tile.x, y: tile.y }];
  if (tile.w <= 0 || tile.h <= 0) return [];

  const i0 = Math.floor((cover.x0 - tile.x) / tile.w);
  const i1 = Math.ceil((cover.x1 - tile.x) / tile.w);
  const j0 = Math.floor((cover.y0 - tile.y) / tile.h);
  const j1 = Math.ceil((cover.y1 - tile.y) / tile.h);

  const out: { x: number; y: number }[] = [];
  for (let j = j0; j < j1; j += 1) {
    for (let i = i0; i < i1; i += 1) {
      out.push({ x: tile.x + i * tile.w, y: tile.y + j * tile.h });
    }
  }
  return out;
}

/**
 * The texture marks as Skia paths, in each icon's own viewBox, with
 * the stylesheet's `rotate(deg cx cy)` baked in. Built once per kit,
 * the way `particlePaths` in cosmetic-worn.tsx does: a path per mark
 * per cell per render would be hundreds of allocations a tile.
 */
function texturePaths(S: Skia) {
  const out: Record<
    string,
    {
      viewBox: { w: number; h: number };
      marks: { path: ReturnType<typeof S.Skia.Path.Make>; mark: TextureMark }[];
    }
  > = {};

  for (const [name, art] of Object.entries(TEXTURE_ART)) {
    const marks: { path: ReturnType<typeof S.Skia.Path.Make>; mark: TextureMark }[] =
      [];
    for (const mark of art.marks) {
      const path = S.Skia.Path.MakeFromSVGString(mark.d);
      if (!path) continue;
      if (mark.rotate) {
        /* The stylesheet turns a mark about its viewBox's centre. */
        const turn = S.Skia.Matrix();
        turn.translate(art.viewBox.w / 2, art.viewBox.h / 2);
        turn.rotate((mark.rotate * Math.PI) / 180);
        turn.translate(-art.viewBox.w / 2, -art.viewBox.h / 2);
        path.transform(turn);
      }
      marks.push({ path, mark });
    }
    out[name] = { viewBox: art.viewBox, marks };
  }

  return out;
}

function makeKit(S: Skia) {
  const {
    BlendMode,
    Canvas,
    Circle,
    Group,
    ImageShader,
    LinearGradient,
    Path,
    RadialGradient,
    Rect,
    RoundedRect,
    Skia,
    SweepGradient,
    rect,
    rrect,
    useImage,
    vec,
  } = S;

  const TEXTURE = texturePaths(S);

  const BLEND: Record<PaintBlend, (typeof BlendMode)[keyof typeof BlendMode]> = {
    normal: BlendMode.SrcOver,
    screen: BlendMode.Screen,
    overlay: BlendMode.Overlay,
    colorDodge: BlendMode.ColorDodge,
    multiply: BlendMode.Multiply,
    luminosity: BlendMode.Luminosity,
  };

  /* Premultiplied interpolation, as CSS does it: a colour fading to
     transparent fades, rather than darkening through black first. */
  const PREMUL = 1;

  /** One linear gradient filling one cell, with CSS's line through its centre. */
  function cellLinear(
    layer: Extract<PaintLayer, { type: "linear" }>,
    cell: { x: number; y: number; w: number; h: number },
    key: string,
  ) {
    const { dx, dy } = direction(layer.angle);
    const L = lineLength(layer.angle, cell);
    if (L <= 0) return null;
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    const positions = layer.positionsPx
      ? layer.positions.map((p) => Math.min(1, Math.max(0, p / L)))
      : layer.positions;

    return (
      <Rect key={key} x={cell.x} y={cell.y} width={cell.w} height={cell.h}>
        <LinearGradient
          start={vec(cx - (dx * L) / 2, cy - (dy * L) / 2)}
          end={vec(cx + (dx * L) / 2, cy + (dy * L) / 2)}
          colors={layer.colors.map(paintColor)}
          positions={positions}
          flags={PREMUL}
        />
      </Rect>
    );
  }

  /** The marks of one texture, fitted into one cell. */
  function cellTexture(
    name: string,
    cell: { x: number; y: number; w: number; h: number },
    key: string,
  ) {
    const texture = TEXTURE[name];
    if (!texture || texture.marks.length === 0) return null;
    /* Uniform, like an SVG's default `xMidYMid meet`: a stretched
       heart is not the heart they bought. */
    const scale = Math.min(cell.w / texture.viewBox.w, cell.h / texture.viewBox.h);
    if (scale <= 0) return null;
    const dx = cell.x + (cell.w - texture.viewBox.w * scale) / 2;
    const dy = cell.y + (cell.h - texture.viewBox.h * scale) / 2;

    return (
      <Group key={key} transform={[{ translateX: dx }, { translateY: dy }, { scale }]}>
        {texture.marks.map(({ path, mark }, index) => (
          <Group key={index}>
            {mark.fill ? (
              <Path
                path={path}
                color={paintColor(mark.fill)}
                opacity={mark.fillOpacity}
              />
            ) : null}
            {mark.stroke ? (
              <Path
                path={path}
                color={paintColor(mark.stroke)}
                opacity={mark.strokeOpacity}
                style="stroke"
                strokeWidth={mark.strokeWidth}
                strokeCap="round"
                strokeJoin="round"
              />
            ) : null}
          </Group>
        ))}
      </Group>
    );
  }

  /**
   * One layer of a stack, painted in its box and slid by the motion.
   *
   * Only a tiled layer travels: the website moves `background-position`
   * and a layer that fills its box once has nowhere to go. Each layer
   * works out its own distance because each has its own tile.
   */
  function Layer({
    layer,
    box,
    motion,
    clock,
    mark,
  }: {
    layer: PaintLayer;
    box: Box;
    motion: BorderMotion | null;
    clock: ReturnType<typeof useSharedValue<number>>;
    mark: ReturnType<typeof useImage>;
  }) {
    const aspect =
      layer.type === "image"
        ? mark
          ? mark.height() / mark.width()
          : null
        : layer.type === "texture"
          ? (TEXTURE[layer.name]?.viewBox.h ?? 1) /
            (TEXTURE[layer.name]?.viewBox.w ?? 1)
          : null;
    const place = "place" in layer ? layer.place : null;
    const placed = resolvePlace(place, box, aspect);

    const kind = motion?.kind ?? "";
    const moves = placed.repeat && TRAVELS.has(kind);
    const pad = kind === "jitter" ? 2 : 0;

    /* The cap is judged against a nominal cover and the exact travel
       is then read off the capped tile, so the snap below is to the
       tile that is actually drawn. */
    const nominal = coverFor(
      box,
      moves ? travelFor(kind, placed, box) : { x: 0, y: 0 },
      pad,
    );
    const tile = capTile(placed, nominal);
    const travel = moves ? travelFor(kind, tile, box) : { x: 0, y: 0 };
    const cover = coverFor(box, travel, pad);

    const slide = useDerivedValue(() => [
      { translateX: travel.x * clock.value },
      { translateY: travel.y * clock.value },
    ]);

    const body = (() => {
      switch (layer.type) {
        case "solid":
          return (
            <Rect
              x={cover.x0}
              y={cover.y0}
              width={cover.x1 - cover.x0}
              height={cover.y1 - cover.y0}
              color={paintColor(layer.color)}
            />
          );

        case "linear": {
          const turn = ((layer.angle % 360) + 360) % 360;
          if (tile.repeat && turn % 90 === 0) {
            /* An axis-aligned tiled gradient is constant across the
               other axis, so one repeating shader is the whole grid:
               the 11-point lines of Digital Grid are one draw, not a
               hundred. */
            const along = turn === 90 || turn === 270 ? "x" : "y";
            const L = along === "x" ? tile.w : tile.h;
            if (L <= 0) return null;
            const from = along === "x" ? tile.x : tile.y;
            const forward = turn === 90 || turn === 180;
            const a = forward ? from : from + L;
            const b = forward ? from + L : from;
            const positions = layer.positionsPx
              ? layer.positions.map((p) => Math.min(1, Math.max(0, p / L)))
              : layer.positions;
            return (
              <Rect
                x={cover.x0}
                y={cover.y0}
                width={cover.x1 - cover.x0}
                height={cover.y1 - cover.y0}
              >
                <LinearGradient
                  start={along === "x" ? vec(a, 0) : vec(0, a)}
                  end={along === "x" ? vec(b, 0) : vec(0, b)}
                  colors={layer.colors.map(paintColor)}
                  positions={positions}
                  mode="repeat"
                  flags={PREMUL}
                />
              </Rect>
            );
          }
          return cellsOf(tile, cover).map((cell, index) =>
            cellLinear(layer, { ...cell, w: tile.w, h: tile.h }, String(index)),
          );
        }

        case "repeat": {
          /* A repeating gradient is periodic by its own period, so it
             is one shader over the whole cover: Skia's repeat mode
             makes it endless, where CSS would stop at the tile's edge. */
          const { dx, dy } = direction(layer.angle);
          const L = lineLength(layer.angle, tile);
          const cx = tile.x + tile.w / 2;
          const cy = tile.y + tile.h / 2;
          const sx = cx - (dx * L) / 2;
          const sy = cy - (dy * L) / 2;
          const area = tile.repeat
            ? cover
            : { x0: tile.x, y0: tile.y, x1: tile.x + tile.w, y1: tile.y + tile.h };
          return (
            <Rect
              x={area.x0}
              y={area.y0}
              width={area.x1 - area.x0}
              height={area.y1 - area.y0}
            >
              <LinearGradient
                start={vec(sx, sy)}
                end={vec(sx + dx * layer.periodPx, sy + dy * layer.periodPx)}
                colors={layer.colors.map(paintColor)}
                positions={layer.positions}
                mode="repeat"
                flags={PREMUL}
              />
            </Rect>
          );
        }

        case "radial":
          return cellsOf(tile, cover).map((cell, index) => {
            /* Skia's radial is a circle; the ellipse is the circle of
               the x radius drawn under a y scale about its centre, with
               the rect pre-stretched so it still covers the cell. */
            const cx = cell.x + layer.cx * tile.w;
            const cy = cell.y + layer.cy * tile.h;
            const r = layer.rx * tile.w;
            const sy = r > 0 ? (layer.ry * tile.h) / r : 0;
            if (r <= 0 || sy < 0.01) return null;
            return (
              <Group key={index} origin={vec(cx, cy)} transform={[{ scaleY: sy }]}>
                <Rect
                  x={cell.x}
                  y={cy + (cell.y - cy) / sy}
                  width={tile.w}
                  height={tile.h / sy}
                >
                  <RadialGradient
                    c={vec(cx, cy)}
                    r={r}
                    colors={layer.colors.map(paintColor)}
                    positions={layer.positions}
                    flags={PREMUL}
                  />
                </Rect>
              </Group>
            );
          });

        case "speck":
          return cellsOf(tile, cover).map((cell, index) => (
            <Circle
              key={index}
              cx={cell.x + layer.cx * tile.w}
              cy={cell.y + layer.cy * tile.h}
              r={layer.radiusPx}
              color={paintColor(layer.color)}
            />
          ));

        case "sweep":
          return cellsOf(tile, cover).map((cell, index) => (
            /* CSS's conic starts at twelve o'clock; Skia's sweep at three. */
            <Rect key={index} x={cell.x} y={cell.y} width={tile.w} height={tile.h}>
              <SweepGradient
                c={vec(cell.x + layer.cx * tile.w, cell.y + layer.cy * tile.h)}
                start={layer.fromDeg - 90}
                end={layer.fromDeg + 270}
                colors={layer.colors.map(paintColor)}
                positions={layer.positions}
                flags={PREMUL}
              />
            </Rect>
          ));

        case "texture":
          return cellsOf(tile, cover).map((cell, index) =>
            cellTexture(layer.name, { ...cell, w: tile.w, h: tile.h }, String(index)),
          );

        case "image": {
          if (!mark) return null;
          /* The mark is fitted into its tile and the shader tiles it
             from there, so the whole field is one draw. */
          const area = tile.repeat
            ? cover
            : { x0: tile.x, y0: tile.y, x1: tile.x + tile.w, y1: tile.y + tile.h };
          return (
            <Rect
              x={area.x0}
              y={area.y0}
              width={area.x1 - area.x0}
              height={area.y1 - area.y0}
            >
              <ImageShader
                image={mark}
                rect={rect(tile.x, tile.y, tile.w, tile.h)}
                fit="fill"
                tx={tile.repeat ? "repeat" : "decal"}
                ty={tile.repeat ? "repeat" : "decal"}
              />
            </Rect>
          );
        }

        default:
          return null;
      }
    })();

    return <Group transform={slide}>{body}</Group>;
  }

  /**
   * A stack of layers in a clipped canvas, with its motion.
   *
   * Bottom layer first, as the data is ordered. The motion is one
   * clock shared by every layer: a sliding one reads its distance off
   * it, and the opacity kinds (pulse, twinkle, flicker) read the group
   * opacity off it. `hue` cannot be done without a colour matrix per
   * frame, so it holds still.
   */
  function Stack({
    layers,
    width,
    height,
    radius,
    motion,
    opacity,
    blend,
    flash,
    inset,
  }: {
    layers: PaintLayer[];
    width: number;
    height: number;
    radius: number;
    motion: BorderMotion | null;
    opacity: number;
    blend: PaintBlend;
    flash: { color: string; seconds: number } | null;
    inset: { color: string; width: number } | null;
  }) {
    const clock = useSharedValue(0);
    const storm = useSharedValue(0);
    const kind = motion?.kind ?? "";

    useEffect(() => {
      if (!motion || kind === "hue") return;

      clock.value = 0;
      clock.value = withRepeat(
        withTiming(1, { duration: motion.seconds * 1000, easing: Easing.linear }),
        -1,
        motion.alternate,
      );

      return () => cancelAnimation(clock);
    }, [motion, kind, clock]);

    useEffect(() => {
      if (!flash) return;

      storm.value = 0;
      storm.value = withRepeat(
        withTiming(1, { duration: flash.seconds * 1000, easing: Easing.linear }),
        -1,
        false,
      );

      return () => cancelAnimation(storm);
    }, [flash, storm]);

    /* The brand mark, only when a layer tiles it. */
    const wantsMark = layers.some((layer) => layer.type === "image");
    const mark = useImage(wantsMark ? MARK : null);

    /* `cfa-pulse` 0.55 -> 1 -> 0.55, `cfa-twinkle` 0.25 -> 0.9 -> 0.25,
       and `cfa-flicker`'s stepped dips, read off the stylesheet. */
    const fade = useDerivedValue(() => {
      const t = clock.value;
      let level = 1;
      if (kind === "pulse") level = 0.55 + 0.45 * Math.sin(Math.PI * t);
      else if (kind === "twinkle") level = 0.25 + 0.65 * Math.sin(Math.PI * t);
      else if (kind === "flicker") {
        if (t >= 0.08 && t < 0.1) level = 0.35;
        else if (t >= 0.38 && t < 0.4) level = 0.6;
        else if (t >= 0.72 && t < 0.74) level = 0.25;
      }
      return opacity * level;
    });

    /* `cfa-jitter`: a couple of points of shake in the last 8%. */
    const shake = useDerivedValue(() => {
      if (kind !== "jitter") return [{ translateX: 0 }, { translateY: 0 }];
      const t = clock.value;
      if (t < 0.92 || t >= 1) return [{ translateX: 0 }, { translateY: 0 }];
      const step = Math.floor((t - 0.92) / 0.02);
      const jumps = [
        { translateX: 2, translateY: -1 },
        { translateX: -2, translateY: 1 },
        { translateX: 1, translateY: 1 },
        { translateX: 0, translateY: 0 },
      ];
      const jump = jumps[Math.min(step, 3)];
      return [{ translateX: jump.translateX }, { translateY: jump.translateY }];
    });

    /* `cfa-flash` in steps: lit from 89% to 93% of the cycle, dark
       the rest - the lightning storm. */
    const lit = useDerivedValue(() => {
      const t = storm.value;
      return t >= 0.89 && t < 0.93 ? 1 : 0;
    });

    /*
     * The website's `mix-blend-mode` is on the whole overlay, so the
     * layers composite normally among themselves first and the result
     * blends once. That is an offscreen layer with the blend on its
     * paint; a plain group would blend each layer separately.
     */
    const film = useMemo(() => {
      if (blend === "normal") return undefined;
      const paint = Skia.Paint();
      paint.setBlendMode(BLEND[blend]);
      return paint;
    }, [blend]);

    if (width <= 0 || height <= 0) return null;

    const box = { w: width, h: height };

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <Group clip={rrect(rect(0, 0, width, height), radius, radius)}>
          <Group layer={film}>
            <Group opacity={fade} transform={shake}>
              {layers.map((layer, index) => (
                <Layer
                  key={index}
                  layer={layer}
                  box={box}
                  motion={motion}
                  clock={clock}
                  mark={mark}
                />
              ))}
            </Group>
          </Group>
          {flash ? (
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              color={paintColor(flash.color)}
              opacity={lit}
            />
          ) : null}
          {inset ? (
            <RoundedRect
              rect={rrect(
                rect(
                  inset.width / 2,
                  inset.width / 2,
                  width - inset.width,
                  height - inset.width,
                ),
                Math.max(0, radius - inset.width / 2),
                Math.max(0, radius - inset.width / 2),
              )}
              style="stroke"
              strokeWidth={inset.width}
              color={paintColor(inset.color)}
            />
          ) : null}
        </Group>
      </Canvas>
    );
  }

  return { Stack };
}

export type PaintKit = ReturnType<typeof makeKit>;

let cached: PaintKit | null | undefined;

/** The kit, or null on a device where Skia will not load. */
export function getPaintKit(): PaintKit | null {
  if (cached === undefined) {
    try {
      cached = makeKit(require("@shopify/react-native-skia"));
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Whether a holo pattern is one the app draws rather than approximates. */
export function drawsPattern(slug: string | null): boolean {
  return hasPatternArt(slug) && getPaintKit() !== null;
}

/** Whether a showcase background is one the app draws. */
export function drawsBackground(slug: string | null): boolean {
  return hasBackgroundArt(slug) && getPaintKit() !== null;
}

/**
 * A stack of paint layers in a canvas the caller places.
 *
 * Absolutely positioned at the caller's origin and clipped to
 * `radius`. Renders nothing on a device without Skia.
 */
export function PaintStack(props: {
  layers: PaintLayer[];
  width: number;
  height: number;
  radius: number;
  motion: BorderMotion | null;
  opacity: number;
  blend: PaintBlend;
  flash: { color: string; seconds: number } | null;
  inset: { color: string; width: number } | null;
}) {
  const kit = getPaintKit();
  if (!kit) return null;

  return <kit.Stack {...props} />;
}

/**
 * The worn holo pattern, sized to a card's face and drawn OVER it.
 *
 * Over the art and over the legacy foil, under any effect ring: the
 * website's `.cfx-card-fx` is `inset: 0` on the face with the face's
 * radius. Null for a slug with no art and on any device without Skia,
 * so a card wearing something unported keeps the plain face it had.
 */
export function WornPattern({
  pattern,
  width,
  height,
  radius,
}: {
  pattern: string | null;
  width: number;
  height: number;
  radius: number;
}) {
  const art = pattern && hasPatternArt(pattern) ? PATTERN_ART[pattern] : undefined;
  if (!art) return null;

  return (
    <PaintStack
      layers={art.layers}
      width={width}
      height={height}
      radius={radius}
      motion={art.motion}
      opacity={art.opacity}
      blend={art.blend}
      flash={null}
      inset={null}
    />
  );
}

/**
 * The worn showcase background, filling the panel behind the shelf.
 *
 * Drawn as the panel's first child so the cards sit on it; the panel's
 * own colour stays underneath as the fallback. Same null rules as the
 * pattern. A background's per-layer `blends` are not applied yet.
 */
export function WornBackground({
  background,
  width,
  height,
  radius,
}: {
  background: string | null;
  width: number;
  height: number;
  radius: number;
}) {
  const art =
    background && hasBackgroundArt(background) ? BACKGROUND_ART[background] : undefined;
  if (!art) return null;

  return (
    <PaintStack
      layers={art.layers}
      width={width}
      height={height}
      radius={radius}
      motion={art.motion}
      opacity={art.opacity}
      blend="normal"
      flash={art.flash}
      inset={art.inset}
    />
  );
}
