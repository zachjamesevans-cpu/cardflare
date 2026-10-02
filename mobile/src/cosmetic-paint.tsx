import { useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  ANIMATION_ART,
  BACKGROUND_ART,
  PATTERN_ART,
  SCENE_ART,
  TEXTURE_ART,
  hasAnimationArt,
  hasBackgroundArt,
  hasPatternArt,
  hasSceneArt,
  type AnimationArt,
  type BorderMotion,
  type FxArt,
  type Len,
  type MotionStop,
  type PaintBlend,
  type PaintLayer,
  type Placement,
  type SceneArt,
  type SpriteArt,
  type TextureMark,
  type Timing,
} from "./cosmetic-art-data";
import { EDGE_RADIUS } from "./cosmetic-border";
import {
  LINEAR,
  TILT_PERSPECTIVE,
  curveFor,
  ease,
  fades,
  trackFor,
  useClock,
  usePose,
  useTrack,
  type Curve,
} from "./cosmetic-motion";

/**
 * Holo patterns, showcase backgrounds, card animations and profile
 * scenes, drawn on a phone.
 *
 * The web paints all four as CSS: a stack of gradients, tiled SVG
 * marks and the brand mark, each at its own position and size, moved
 * by keyframes and blended over the card; and for the animations and
 * scenes, pseudo-elements that sweep, spin, ripple and streak over
 * the face, plus keyframes that lean and float the whole card. React
 * Native has none of that, so `cosmetic-art-data.ts` carries it all as
 * data and this file paints it with Skia - the same bargain the foil,
 * the worn ring and the card border make, and the same guarded,
 * deferred require, so a binary without Skia keeps the plain card and
 * the plain panel instead of failing to launch.
 *
 * One renderer for every family. A pattern is a stack over a card
 * face with a blend mode; a background is a stack behind a shelf with
 * a hairline and sometimes a flash; an animation's fx is a stack over
 * the face with sprites on top and a track on the card; a scene is
 * the same over a profile block. Nothing in here knows which it is
 * drawing beyond those props. The keyframes themselves are played by
 * `cosmetic-motion.ts`.
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

/** The kinds that slide the layers a fixed way; everything else changes opacity or holds. */
const TRAVELS = new Set(["pan", "pan-y", "fall", "rise", "drift"]);

/**
 * `cfa-wander`: where the spotlight's layer sits through its cycle, as
 * CSS background positions, 18%/30% -> 78%/40% -> 45%/75% and home.
 */
const WANDER_AT = [0, 0.33, 0.66, 1];
const WANDER_X = [0.18, 0.78, 0.45, 0.18];
const WANDER_Y = [0.3, 0.4, 0.75, 0.3];

const RAD = Math.PI / 180;

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

/** The four corners of a sprite's box, resolved against the face it sits on. */
function spriteBox(sprite: SpriteArt, width: number, height: number) {
  return {
    left: length(sprite.box.left, width) ?? 0,
    top: length(sprite.box.top, height) ?? 0,
    w: length(sprite.box.width, width) ?? width,
    h: length(sprite.box.height, height) ?? height,
  };
}

/**
 * A view that plays keyframe tracks on whatever it holds.
 *
 * The website puts `cfa-float`, `cfa-tilt`, `cfa-breathe`, `cfa-pulse`
 * and `cfa-glitch` on the card element itself, so the whole card moves
 * - border, face and all. React Native can do that natively: a
 * Reanimated transform with `perspective` for the lean, no Skia
 * needed. One wrapper per timing, nested, so a card with two tracks
 * plays both; an empty list is a plain box, which the animation uses
 * to carry its glow and its overlay.
 */
export function TrackedView({
  timings,
  width,
  height,
  style,
  children,
}: {
  timings: Timing[];
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [first, ...rest] = timings;
  const { pose, track } = useTrack(first ?? null, { w: width, h: height });
  const tracked = fades(track);

  const animated = useAnimatedStyle(() => {
    const p = pose.value;
    return {
      opacity: tracked ? p.opacity : 1,
      transform: [
        { perspective: TILT_PERSPECTIVE },
        { translateX: p.tx },
        { translateY: p.ty },
        { rotateX: `${p.tiltX}deg` },
        { rotateY: `${p.tiltY}deg` },
        { rotate: `${p.rotate}deg` },
        { skewX: `${p.skewX}deg` },
        { scale: p.scale },
      ],
    };
  });

  return (
    <Animated.View style={[{ width, height }, style, animated]}>
      {rest.length > 0 ? (
        <TrackedView timings={rest} width={width} height={height}>
          {children}
        </TrackedView>
      ) : (
        children
      )}
    </Animated.View>
  );
}

function makeKit(S: Skia) {
  const {
    BlendMode,
    BlurMask,
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
   * works out its own distance because each has its own tile. The
   * clock is linear and the easing is applied here, per cycle, so a
   * `steps(14)` rise climbs in fourteen jumps as the pixel particles
   * do on the web. `wander` is the one kind with keyframes of its own:
   * the layer's position walks between four points, eased between
   * each pair.
   */
  function Layer({
    layer,
    box,
    kind,
    clock,
    curve,
    mark,
  }: {
    layer: PaintLayer;
    box: Box;
    kind: string;
    clock: SharedValue<number>;
    curve: Curve;
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

    const moves = placed.repeat && TRAVELS.has(kind);
    const wanders = kind === "wander";
    const pad = kind === "jitter" ? 2 : 0;

    /* The cap is judged against a nominal cover and the exact travel
       is then read off the capped tile, so the snap below is to the
       tile that is actually drawn. A wandering layer can land anywhere
       within a tile of home, so its cover is a tile wider all round. */
    const nominal = wanders
      ? { x0: -placed.w, y0: -placed.h, x1: box.w + placed.w, y1: box.h + placed.h }
      : coverFor(box, moves ? travelFor(kind, placed, box) : { x: 0, y: 0 }, pad);
    const tile = capTile(placed, nominal);
    const travel = moves ? travelFor(kind, tile, box) : { x: 0, y: 0 };
    const cover = wanders
      ? { x0: -tile.w, y0: -tile.h, x1: box.w + tile.w, y1: box.h + tile.h }
      : coverFor(box, travel, pad);

    const slide = useDerivedValue(() => {
      const t = Math.max(0, clock.value);
      if (wanders) {
        let i = 0;
        for (let k = 0; k < 3; k += 1) {
          if (t >= WANDER_AT[k]) i = k;
        }
        const p = ease(curve, (t - WANDER_AT[i]) / (WANDER_AT[i + 1] - WANDER_AT[i]));
        const fx = WANDER_X[i] + (WANDER_X[i + 1] - WANDER_X[i]) * p;
        const fy = WANDER_Y[i] + (WANDER_Y[i + 1] - WANDER_Y[i]) * p;
        return [
          { translateX: (box.w - tile.w) * fx - tile.x },
          { translateY: (box.h - tile.h) * fy - tile.y },
        ];
      }
      const e = ease(curve, t);
      return [{ translateX: travel.x * e }, { translateY: travel.y * e }];
    });

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
   * it, and the group reads its fade and its shake off it. A motion
   * that names a keyframe track (flicker, twinkle, pulse, flash,
   * jitter, dealin) plays the track's own stops, from the stylesheet,
   * and the track's opacity replaces the stack's as a CSS animation
   * would; the hand-read curves below stay as the fallback for a kind
   * no track describes. `hue` cannot be done without a colour matrix
   * per frame, so it holds still.
   *
   * `maskInsetPx` shows only a band that wide at the edge (the
   * electric arcs), and `clipHeight` lets a layer shorter than its
   * panel (the aurora's top 44%) keep the panel's corners rather than
   * growing its own.
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
    track: trackOverride = null,
    maskInsetPx = null,
    clipHeight,
  }: {
    layers: PaintLayer[];
    width: number;
    height: number;
    radius: number;
    motion: BorderMotion | Timing | null;
    opacity: number;
    blend: PaintBlend;
    flash: { color: string; seconds: number } | null;
    inset: { color: string; width: number } | null;
    track?: MotionStop[] | null;
    maskInsetPx?: number | null;
    clipHeight?: number;
  }) {
    const kind = motion?.kind ?? "";
    const clock = useClock(kind === "hue" ? null : motion);
    const track = trackOverride ?? trackFor(motion);
    const tracked = fades(track);
    const curve = curveFor(motion);
    const pose = usePose(clock, motion, track, { w: width, h: height });

    const stormMotion = useMemo<BorderMotion | null>(
      () =>
        flash ? { kind: "flash", seconds: flash.seconds, alternate: false } : null,
      [flash],
    );
    const storm = useClock(stormMotion);

    /* The brand mark, only when a layer tiles it. */
    const wantsMark = layers.some((layer) => layer.type === "image");
    const mark = useImage(wantsMark ? MARK : null);

    /* The track's own opacity when it has one; else `cfa-pulse`
       0.55 -> 1 -> 0.55, `cfa-twinkle` 0.25 -> 0.9 -> 0.25, and
       `cfa-flicker`'s stepped dips, read off the stylesheet. */
    const fade = useDerivedValue(() => {
      if (tracked) return pose.value.opacity;
      const t = Math.max(0, clock.value);
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

    /* The track's transform about the box's centre; else `cfa-jitter`,
       a couple of points of shake in the last 8%. */
    const shake = useDerivedValue(() => {
      if (track) {
        const p = pose.value;
        return [
          { translateX: p.tx },
          { translateY: p.ty },
          { rotate: p.rotate * RAD },
          { skewX: p.skewX * RAD },
          { scale: p.scale },
        ];
      }
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
    const clipTo = clipHeight ?? height;

    const painted = (
      <Group opacity={fade} transform={shake} origin={vec(width / 2, height / 2)}>
        {layers.map((layer, index) => (
          <Layer
            key={index}
            layer={layer}
            box={box}
            kind={kind}
            clock={clock}
            curve={curve}
            mark={mark}
          />
        ))}
      </Group>
    );

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <Group clip={rrect(rect(0, 0, width, clipTo), radius, radius)}>
          <Group layer={film}>
            {maskInsetPx !== null && maskInsetPx > 0 ? (
              /* The website masks the middle out with `mask-composite:
                 exclude`; an inverted clip is the same hole. */
              <Group
                clip={rect(
                  maskInsetPx,
                  maskInsetPx,
                  width - maskInsetPx * 2,
                  height - maskInsetPx * 2,
                )}
                invertClip
              >
                {painted}
              </Group>
            ) : (
              painted
            )}
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

  /** The fx layer of an animation or a scene, over a face or a panel. */
  function Fx({
    fx,
    width,
    height,
    radius,
  }: {
    fx: FxArt;
    width: number;
    height: number;
    radius: number;
  }) {
    /* `height` is how much of the panel the layer covers, from the
       top: the aurora's band. The clip stays the panel's. */
    const covered = fx.height ? (length(fx.height, height) ?? height) : height;
    return (
      <Stack
        layers={fx.layers}
        width={width}
        height={covered}
        clipHeight={height}
        radius={radius}
        motion={fx.timing}
        opacity={fx.opacity}
        blend="normal"
        flash={null}
        inset={null}
        maskInsetPx={fx.maskInsetPx}
      />
    );
  }

  /**
   * A sprite: the stylesheet's `::before` / `::after` over a face or a
   * panel, in one canvas sized to the face and clipped to it.
   *
   * Its box is resolved against the face (the sheen's is bigger than
   * the face and the face clips it), its layers paint inside the box,
   * its border strokes the box, its glow is the box blurred behind,
   * and its track moves the lot about the box's centre, as a CSS
   * transform does. `round` is an ellipse, or the face's own corners
   * when the box is the whole face.
   */
  function Sprite({
    sprite,
    width,
    height,
    radius,
  }: {
    sprite: SpriteArt;
    width: number;
    height: number;
    radius: number;
  }) {
    const { left, top, w, h } = spriteBox(sprite, width, height);
    const box = useMemo(() => ({ w, h }), [w, h]);
    const { clock, pose, track } = useTrack(sprite.timing, box);
    const tracked = fades(track);

    const transform = useDerivedValue(() => {
      const p = pose.value;
      return [
        { translateX: p.tx },
        { translateY: p.ty },
        { rotate: p.rotate * RAD },
        { skewX: p.skewX * RAD },
        { scale: p.scale },
      ];
    });
    const opacity = useDerivedValue(() => (tracked ? pose.value.opacity : 1));

    if (width <= 0 || height <= 0 || w <= 0 || h <= 0) return null;

    const whole = left <= 0 && top <= 0 && left + w >= width && top + h >= height;
    const rx = sprite.round ? (whole ? radius : w / 2) : 0;
    const ry = sprite.round ? (whole ? radius : h / 2) : 0;
    const shape = rrect(rect(left, top, w, h), rx, ry);
    const bw = sprite.border?.width ?? 0;
    /* A CSS border sits inside the box; a stroke is centred on its
       path, so the path steps in by half the width. */
    const edge = rrect(
      rect(left + bw / 2, top + bw / 2, w - bw, h - bw),
      Math.max(0, rx - bw / 2),
      Math.max(0, ry - bw / 2),
    );

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <Group clip={rrect(rect(0, 0, width, height), radius, radius)}>
          <Group
            opacity={opacity}
            transform={transform}
            origin={vec(left + w / 2, top + h / 2)}
          >
            {sprite.glow ? (
              <RoundedRect rect={shape} color={paintColor(sprite.glow.color)}>
                <BlurMask blur={sprite.glow.radius / 2} style="normal" />
              </RoundedRect>
            ) : null}
            <Group clip={shape}>
              <Group transform={[{ translateX: left }, { translateY: top }]}>
                {sprite.layers.map((layer, index) => (
                  <Layer
                    key={index}
                    layer={layer}
                    box={box}
                    kind=""
                    clock={clock}
                    curve={LINEAR}
                    mark={null}
                  />
                ))}
              </Group>
            </Group>
            {sprite.border ? (
              <RoundedRect
                rect={edge}
                style="stroke"
                strokeWidth={bw}
                color={paintColor(sprite.border.color)}
              />
            ) : null}
          </Group>
        </Group>
      </Canvas>
    );
  }

  /**
   * An animation's moving edge, drawn where a worn border's would be.
   *
   * The flame edge: the website sets `--cfa-edge` to a gradient and
   * spreads it to 220% of the card, then pans it up and down and
   * flickers it. The same four points as `CardEdge`, with the same
   * corners, so a card wearing it reads as a bordered card; the face
   * covers the middle. The pan is CSS's own distance (position 50% to
   * -200% of the box less the layer) rather than a snapped tile, since
   * `alternate` means it never has to meet itself.
   */
  function Edge({
    art,
    width,
    height,
  }: {
    art: AnimationArt;
    width: number;
    height: number;
  }) {
    const edge = art.card.edge;
    const timings = art.card.timings;
    const sliding =
      timings.find((timing) => timing.kind === "pan" || timing.kind === "pan-y") ??
      null;
    const fading = timings.find((timing) => fades(trackFor(timing))) ?? null;

    const slideClock = useClock(sliding);
    const slideCurve = curveFor(sliding);
    const { pose, track } = useTrack(fading, { w: width, h: height });
    const tracked = fades(track);

    const angle = edge && edge.type === "linear" ? edge.angle : 0;
    const { dx, dy } = direction(angle);
    const spread = art.card.edgeSpread ?? { x: 1, y: 1 };
    const span = Math.abs(width * spread.x * dx) + Math.abs(height * spread.y * dy);
    const centre = { x: width / 2, y: height / 2 };

    /* How far the layer moves per cycle, projected onto the line. */
    const travel =
      sliding?.kind === "pan"
        ? 2 * (width - width * spread.x) * dx
        : sliding?.kind === "pan-y"
          ? -2.5 * (height - height * spread.y) * dy
          : 0;

    const slide = useDerivedValue(
      () => travel * ease(slideCurve, Math.max(0, slideClock.value)),
    );
    const start = useDerivedValue(() =>
      vec(
        centre.x - (dx * span) / 2 + dx * slide.value,
        centre.y - (dy * span) / 2 + dy * slide.value,
      ),
    );
    const end = useDerivedValue(() =>
      vec(
        centre.x + (dx * span) / 2 + dx * slide.value,
        centre.y + (dy * span) / 2 + dy * slide.value,
      ),
    );
    const opacity = useDerivedValue(() => (tracked ? pose.value.opacity : 1));

    if (!edge || edge.type !== "linear" || width <= 0 || height <= 0) return null;

    return (
      <Canvas style={{ position: "absolute", width, height }} pointerEvents="none">
        <Group opacity={opacity}>
          <RoundedRect
            rect={rrect(rect(0, 0, width, height), EDGE_RADIUS, EDGE_RADIUS)}
          >
            <LinearGradient
              start={start}
              end={end}
              colors={edge.colors.map(paintColor)}
              positions={edge.positions}
              mode="repeat"
              flags={PREMUL}
            />
          </RoundedRect>
        </Group>
      </Canvas>
    );
  }

  /**
   * A card animation around a card.
   *
   * The card's own tracks (float, tilt, breathe, pulse, glitch) move
   * the whole card, border and all, through `TrackedView`; the glows
   * ride on the same view so they move with it, as a box-shadow does.
   * The fx and the sprites are drawn over the face only, in a view
   * inset by the edge and clipped to the face's corners. An animation
   * with an edge of its own (the flame) gives its tracks to the edge
   * instead, which `Edge` plays.
   */
  function Animation({
    art,
    width,
    height,
    radius,
    inset,
    faceRadius,
    children,
  }: {
    art: AnimationArt;
    width: number;
    height: number;
    radius: number;
    inset: number;
    faceRadius: number;
    children: ReactNode;
  }) {
    const timings = art.card.edge
      ? []
      : art.card.timings.filter((timing) => trackFor(timing) !== null);
    const faceWidth = width - inset * 2;
    const faceHeight = height - inset * 2;

    const glow: ViewStyle | undefined =
      art.card.glows.length > 0
        ? {
            borderRadius: radius,
            boxShadow: art.card.glows.map((g) => ({
              offsetX: 0,
              offsetY: 0,
              blurRadius: g.radius,
              color: g.color,
            })),
          }
        : undefined;

    return (
      <TrackedView timings={timings} width={width} height={height} style={glow}>
        {children}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: inset,
            top: inset,
            width: faceWidth,
            height: faceHeight,
            borderRadius: faceRadius,
            overflow: "hidden",
          }}
        >
          {art.fx ? (
            <Fx fx={art.fx} width={faceWidth} height={faceHeight} radius={faceRadius} />
          ) : null}
          {art.sprites.map((sprite, index) => (
            <Sprite
              key={index}
              sprite={sprite}
              width={faceWidth}
              height={faceHeight}
              radius={faceRadius}
            />
          ))}
        </View>
      </TrackedView>
    );
  }

  /** A profile scene over a profile block: the fx layer and the sprites. */
  function Scene({
    art,
    width,
    height,
    radius,
  }: {
    art: SceneArt;
    width: number;
    height: number;
    radius: number;
  }) {
    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        {art.fx ? (
          <Fx fx={art.fx} width={width} height={height} radius={radius} />
        ) : null}
        {art.sprites.map((sprite, index) => (
          <Sprite
            key={index}
            sprite={sprite}
            width={width}
            height={height}
            radius={radius}
          />
        ))}
      </View>
    );
  }

  return { Stack, Sprite, Edge, Animation, Scene };
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

/** Whether a card animation is one the app plays. */
export function drawsAnimation(slug: string | null): boolean {
  return hasAnimationArt(slug) && getPaintKit() !== null;
}

/** Whether an animation brings an edge of its own, in place of a border's. */
export function drawsAnimationEdge(slug: string | null): boolean {
  return Boolean(
    slug &&
    slug in ANIMATION_ART &&
    ANIMATION_ART[slug].card.edge?.type === "linear" &&
    getPaintKit() !== null,
  );
}

/** Whether a profile scene is one the app plays. */
export function drawsScene(slug: string | null): boolean {
  return hasSceneArt(slug) && getPaintKit() !== null;
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
  motion: BorderMotion | Timing | null;
  opacity: number;
  blend: PaintBlend;
  flash: { color: string; seconds: number } | null;
  inset: { color: string; width: number } | null;
  /** A keyframe track to play over the layers, in place of the motion's own. */
  track?: MotionStop[] | null;
  /** Show only a band this wide at the edge. */
  maskInsetPx?: number | null;
  /** Clip to this height rather than the layers' own. */
  clipHeight?: number;
}) {
  const kit = getPaintKit();
  if (!kit) return null;

  return <kit.Stack {...props} />;
}

/**
 * One sprite of an animation or a scene, in a canvas sized to the
 * face or panel it sits on. Renders nothing on a device without Skia.
 */
export function Sprite(props: {
  sprite: SpriteArt;
  width: number;
  height: number;
  radius: number;
}) {
  const kit = getPaintKit();
  if (!kit) return null;

  return <kit.Sprite {...props} />;
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

/**
 * The worn card animation, around a card.
 *
 * Wraps the card's OUTER view, so float, tilt and breathe move the
 * whole card including its border, while the fx and the sprites are
 * drawn over the face only: `inset` is the edge's width and
 * `faceRadius` the face's corners, exactly the face the card itself
 * drew. Hands `children` back unchanged for a slug with no art and on
 * any device without Skia, so nothing about a card changes when it
 * wears something unported.
 */
export function WornAnimation({
  animation,
  width,
  height,
  radius,
  inset,
  faceRadius,
  children,
}: {
  animation: string | null;
  width: number;
  height: number;
  radius: number;
  inset: number;
  faceRadius: number;
  children: ReactNode;
}) {
  const kit = getPaintKit();
  const art =
    animation && hasAnimationArt(animation) ? ANIMATION_ART[animation] : undefined;
  if (!kit || !art) return <>{children}</>;

  return (
    <kit.Animation
      art={art}
      width={width}
      height={height}
      radius={radius}
      inset={inset}
      faceRadius={faceRadius}
    >
      {children}
    </kit.Animation>
  );
}

/**
 * An animation's own edge, drawn as the card's edge when no border is
 * worn. Null unless the animation brings one and Skia is present.
 */
export function AnimationEdge({
  animation,
  width,
  height,
}: {
  animation: string | null;
  width: number;
  height: number;
}) {
  const kit = getPaintKit();
  const art =
    animation && drawsAnimationEdge(animation) ? ANIMATION_ART[animation] : null;
  if (!kit || !art) return null;

  return <kit.Edge art={art} width={width} height={height} />;
}

/**
 * The worn profile scene, over a whole profile block.
 *
 * Absolutely filled and clipped to the block's corners, above the
 * cover and below the controls, as the website's `WornSceneLayer`
 * sits. Nothing in it takes a touch. Null for a slug with no art and
 * on any device without Skia.
 */
export function WornScene({
  scene,
  width,
  height,
  radius,
}: {
  scene: string | null;
  width: number;
  height: number;
  radius: number;
}) {
  const kit = getPaintKit();
  const art = scene && hasSceneArt(scene) ? SCENE_ART[scene] : undefined;
  if (!kit || !art || width <= 0 || height <= 0) return null;

  return <kit.Scene art={art} width={width} height={height} radius={radius} />;
}
