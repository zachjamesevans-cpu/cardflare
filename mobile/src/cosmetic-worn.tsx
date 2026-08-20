import { useEffect } from "react";
import { View } from "react-native";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { auraClearance, auraLayer, ringLayer } from "./avatar-geometry";
import {
  AURA_ART,
  RING_ART,
  type AuraArt,
  type AuraShape,
  type RingArt,
} from "./cosmetic-art-data";

/**
 * A worn ring and a worn aura, drawn on a phone.
 *
 * The gap this closes, reported from a real device: "animated cosmetics
 * don't work in app still - any of them. The holo patterns work for
 * cards but all profile cosmetics do not." Exactly right, and it was
 * never a bug — the app had no way to draw them. Card holo got a Skia
 * implementation (see foil.tsx) and the avatar never did, so a ring
 * somebody spent Embers on came out as a flat band of colour.
 *
 * Same approach as the foil, for the same reasons. Skia gives us a
 * sweep gradient, which IS a conic gradient, and Reanimated turns it on
 * the UI thread at the web's own periods. The palettes and the seconds
 * are read out of the stylesheet — see cosmetic-art-data.ts — so the
 * two platforms cannot quietly disagree about what somebody bought.
 *
 * THE REQUIRE IS GUARDED AND DEFERRED, and that is a launch-safety
 * decision rather than a style one: importing Skia runs a synchronous
 * native install the moment the module loads, and doing that inside the
 * splash window turns a failure into an app that never draws. If Skia
 * is missing this returns null and `PlayerAvatar` keeps its flat-colour
 * stand-in, which is the same bargain the foil makes.
 */

type Skia = typeof import("@shopify/react-native-skia");

/**
 * What each aura's particle actually looks like.
 *
 * The path data is the stylesheet's own, lifted out of the
 * `--cfa-p-*` data URIs in `src/app/cosmetic-art.css` - a heart is the
 * same heart on both platforms, not an approximation of one. Which
 * shape belongs to which aura is NOT decided here: that comes from
 * `AURA_ART[slug].shape`, which the generator reads out of the same
 * stylesheet, so the two can never drift apart.
 *
 * THIS IS THE GAP IT CLOSES. Every aura used to be `<Circle r={dot} />`
 * in a different colour, so Hearts was a pink dot, Snow was a white dot
 * and Holo Shards was a blue one - eight cosmetics people had spent
 * Embers on, all drawn as the same speck. The founder saw the hearts
 * on a real phone and they were circles.
 *
 * Sizes are in each icon's own viewBox and normalised below, so these
 * stay copy-paste comparable with the CSS rather than being re-scaled
 * by hand into some other unit.
 *
 * The one thing not carried over is the petal's `rotate(24 32 32)`: on
 * the web every tile is rotated alike, and here the particles are
 * already scattered around a circle, so it would buy nothing.
 */
const SHAPES: Record<
  AuraShape,
  {
    /** The mark, in its own viewBox. */
    d: string;
    /** Stroked at this width, in viewBox units, instead of filled. */
    stroke?: number;
    /** The second, brighter mark some of them carry on top. */
    inner?: string;
  }
> = {
  heart: {
    d: "M32 40s-7-4.6-7-9.6c0-2.9 2-4.4 4-4.4 1.3 0 2.4.7 3 1.7.6-1 1.7-1.7 3-1.7 2 0 4 1.5 4 4.4 0 5-7 9.6-7 9.6z",
  },
  petal: { d: "M32 23c4 4.5 6 7 6 10a6 6 0 1 1-12 0c0-3 2-5.5 6-10z" },
  star: { d: "M32 23l1.8 7.2 7.2 1.8-7.2 1.8L32 41l-1.8-7.2L23 32l7.2-1.8z" },
  bolt: { d: "M34 20l-8 13h5l-1 11 9-15h-5z" },
  shard: { d: "M29 23L36 26L35 40L27 36Z" },
  /* An ember with a hotter core, and a bubble with a glint: two
     circles each, exactly as the stylesheet layers them. */
  spark: {
    d: "M9.6 12a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0z",
    inner: "M10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0z",
  },
  bubble: {
    d: "M25 32a7 7 0 1 0 14 0 7 7 0 1 0-14 0z",
    stroke: 1.4,
    inner: "M27.9 29.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z",
  },
  flake: {
    d: "M32 24v16M24 32h16M26.3 26.3l11.4 11.4M37.7 26.3L26.3 37.7",
    stroke: 1.6,
  },
};

/**
 * The shapes as Skia paths, centred on the origin and sized so the
 * particle's own radius is 1.
 *
 * Normalised from the path's MEASURED bounds rather than from the
 * viewBox, because every one of these icons is a small mark floating in
 * a large box - the heart occupies about fourteen units of sixty-four -
 * and scaling by the box would draw them all far too small. The stroke
 * is scaled by the same factor, and half of it counts towards the
 * extent, or a stroked flake would be drawn wider than it measures.
 *
 * Built once per kit. A path per particle per frame would be sixteen
 * allocations a tick on a roster that is already redrawing.
 */
function particlePaths(S: Skia) {
  const out = {} as Record<
    AuraShape,
    { path: ReturnType<typeof S.Skia.Path.Make>; stroke?: number; inner?: ReturnType<typeof S.Skia.Path.Make> }
  >;

  for (const key of Object.keys(SHAPES) as AuraShape[]) {
    const shape = SHAPES[key];
    const path = S.Skia.Path.MakeFromSVGString(shape.d);
    if (!path) continue;

    const bounds = path.getBounds();
    const half = shape.stroke ? shape.stroke / 2 : 0;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const reach = Math.max(bounds.width, bounds.height) / 2 + half;
    const scale = reach > 0 ? 1 / reach : 1;

    const place = S.Skia.Matrix();
    place.scale(scale, scale);
    place.translate(-cx, -cy);

    path.transform(place);

    const inner = shape.inner ? S.Skia.Path.MakeFromSVGString(shape.inner) : null;
    if (inner) inner.transform(place);

    out[key] = {
      path,
      stroke: shape.stroke ? shape.stroke * scale : undefined,
      inner: inner ?? undefined,
    };
  }

  return out;
}

function makeKit(S: Skia) {
  const { BlurMask, Canvas, Circle, Group, Path, Skia, SweepGradient, vec } = S;

  const PARTICLE = particlePaths(S);

  /**
   * The ring: a stroked circle filled with a turning sweep gradient.
   *
   * Stroked rather than two filled circles, because a stroke is one draw
   * call and this sits behind every avatar in a room roster. A shop's
   * Friday night can put a dozen of these on one screen.
   *
   * IT DRAWS ITS OWN BOX, bigger than the avatar and pulled back over
   * it, because the band belongs OUTSIDE the picture and the glow
   * belongs outside that. The first cut stroked at a radius inside the
   * avatar and let the caller place it, which put a ring somebody had
   * paid Embers for entirely underneath their own face.
   */
  function Ring({ art, size }: { art: RingArt; size: number }) {
    const turn = useSharedValue(0);

    useEffect(() => {
      if (art.spinSeconds === null) return;

      turn.value = 0;
      turn.value = withRepeat(
        withTiming(1, {
          duration: art.spinSeconds * 1000,
          easing: Easing.linear,
        }),
        -1,
        false,
      );

      /* Cancelled on the way out. A roster that scrolls would otherwise
         leave an animation running per avatar it has passed. */
      return () => cancelAnimation(turn);
    }, [art.spinSeconds, turn]);

    const spin = useDerivedValue(() => [{ rotate: turn.value * Math.PI * 2 }]);

    const { box, offset, radius, strokeWidth } = ringLayer(size);

    /* Room for the glow to fall off in. A canvas cut to the band alone
       clips the blur into a hard edge, which reads as a second, uglier
       ring. */
    const pad = art.glow ? Math.ceil(art.glow.radius) : 1;
    const canvas = box + pad * 2;
    const centre = canvas / 2;

    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -(offset + pad),
          left: -(offset + pad),
          width: canvas,
          height: canvas,
        }}
      >
        <Canvas style={{ width: canvas, height: canvas }}>
          {/* The website's `drop-shadow`, which Skia spells as a blurred
              copy underneath. Static rather than spun with the band: a
              blur this soft is the same shape at every angle, and one
              fewer thing to animate on a roster of twelve. */}
          {art.glow ? (
            <Circle
              cx={centre}
              cy={centre}
              r={radius}
              style="stroke"
              strokeWidth={strokeWidth}
              color={art.glow.color}
            >
              <BlurMask blur={art.glow.radius} style="solid" />
            </Circle>
          ) : null}
          <Group origin={vec(centre, centre)} transform={spin}>
            <Circle
              cx={centre}
              cy={centre}
              r={radius}
              style="stroke"
              strokeWidth={strokeWidth}
            >
              <SweepGradient
                c={vec(centre, centre)}
                colors={art.colors}
                positions={art.positions}
              />
            </Circle>
          </Group>
        </Canvas>
      </View>
    );
  }

  /**
   * The aura: a field of particles orbiting the picture.
   *
   * One shared clock rather than one per particle. Each particle reads
   * the same value at its own offset, so an aura of sixteen is one
   * animation, not sixteen — which is what keeps a roster cheap.
   *
   * ORBITING OUTSIDE THE PICTURE, and drawn over the top of it. Both
   * halves of that were wrong first time and the founder caught it: "I
   * can kinda see the animated hearts on an avatar, but they're behind
   * the avatar." They were orbiting at 0.44 of the avatar's width, well
   * inside its own edge, underneath an opaque face.
   */
  function Aura({ art, size }: { art: AuraArt; size: number }) {
    const clock = useSharedValue(0);

    useEffect(() => {
      clock.value = 0;
      clock.value = withRepeat(
        withTiming(1, { duration: art.seconds * 1000, easing: Easing.linear }),
        -1,
        false,
      );

      return () => cancelAnimation(clock);
    }, [art.seconds, clock]);

    const { box, centre, offset, orbit } = auraLayer(size);
    const dot = Math.max(1.5, size * art.scale);

    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -offset,
          left: -offset,
          width: box,
          height: box,
        }}
      >
        <Canvas style={{ width: box, height: box }}>
          {Array.from({ length: art.count }, (_, index) => (
            <Particle
              key={index}
              index={index}
              art={art}
              clock={clock}
              centre={centre}
              orbit={orbit}
              dot={dot}
              clear={auraClearance(size, dot)}
            />
          ))}
        </Canvas>
      </View>
    );
  }

  /** One speck, at its own phase of the shared clock. */
  function Particle({
    index,
    art,
    clock,
    centre,
    orbit,
    dot,
    clear,
  }: {
    index: number;
    art: AuraArt;
    clock: ReturnType<typeof useSharedValue<number>>;
    centre: number;
    orbit: number;
    dot: number;
    /** The radius a rising or falling particle may not come inside. */
    clear: number;
  }) {
    /* Deterministic scatter. A random start would make the same aura
       look different every time the screen mounted, and the web's is
       laid out by a repeating tile — steady, not random. */
    const phase = (index * 0.6180339887) % 1;
    const angle = phase * Math.PI * 2;
    const colour = art.colors[index % art.colors.length];

    const position = useDerivedValue(() => {
      const t = (clock.value + phase) % 1;

      switch (art.motion) {
        case "rise":
        case "fall": {
          /* Up (or down) the OUTSIDE and away, which is what a spark
             does, and which this always said it did. The lane is the
             particle's own scatter until the sweep brings it level with
             the picture; there it is pushed out to `clear`, so it rides
             around the edge instead of across a face. */
          const y =
            art.motion === "rise"
              ? centre + orbit - t * orbit * 2
              : centre - orbit + t * orbit * 2;

          const lane = Math.cos(angle) * orbit;
          const blocked = clear * clear - (y - centre) * (y - centre);
          const push = blocked > 0 ? Math.sqrt(blocked) : 0;

          return {
            x:
              centre +
              (Math.abs(lane) < push ? (lane < 0 ? -push : push) : lane),
            y,
          };
        }
        case "drift": {
          const a = angle + t * Math.PI * 2;
          return { x: centre + Math.cos(a) * orbit, y: centre + Math.sin(a) * orbit };
        }
        default:
          /* Twinkle and flicker stay put and change opacity instead. */
          return {
            x: centre + Math.cos(angle) * orbit,
            y: centre + Math.sin(angle) * orbit,
          };
      }
    });

    const cx = useDerivedValue(() => position.value.x);
    const cy = useDerivedValue(() => position.value.y);

    const opacity = useDerivedValue(() => {
      const t = (clock.value + phase) % 1;

      switch (art.motion) {
        case "rise":
        case "fall":
          /* Fades in and out at the ends of its travel, so nothing pops
             into existence at the edge of the picture. */
          return art.opacity * Math.sin(t * Math.PI);
        case "twinkle":
          return art.opacity * (0.25 + 0.75 * Math.abs(Math.sin(t * Math.PI * 2)));
        case "flicker":
          /* Stepped rather than eased: static is not a smooth thing. */
          return art.opacity * (t % 0.25 < 0.125 ? 1 : 0.15);
        default:
          return art.opacity;
      }
    });

    /*
     * The mark itself, scaled to the particle's radius and carried to
     * where the motion put it. The fallback is the old plain circle,
     * and only for a shape whose path would not build - better a speck
     * than a hole where somebody's cosmetic should be.
     */
    const drawn = PARTICLE[art.shape];

    const transform = useDerivedValue(() => [
      { translateX: position.value.x },
      { translateY: position.value.y },
      { scale: dot },
    ]);

    if (!drawn) {
      return <Circle cx={cx} cy={cy} r={dot} color={colour} opacity={opacity} />;
    }

    return (
      <Group transform={transform} opacity={opacity}>
        <Path
          path={drawn.path}
          color={colour}
          style={drawn.stroke ? "stroke" : "fill"}
          strokeWidth={drawn.stroke}
          strokeCap="round"
          strokeJoin="round"
        />
        {drawn.inner ? <Path path={drawn.inner} color={art.colors[1]} /> : null}
      </Group>
    );
  }

  return { Ring, Aura };
}

export type WornKit = ReturnType<typeof makeKit>;

let cached: WornKit | null | undefined;

/** The kit, or null on a device where Skia will not load. */
export function getWornKit(): WornKit | null {
  if (cached === undefined) {
    try {
      cached = makeKit(require("@shopify/react-native-skia"));
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * The worn ring, sized to an avatar and drawn UNDER it.
 *
 * Under, because the band sits outside the picture's edge and the
 * website masks the picture out of the film anyway — "the ring kinda
 * digs into the profile pic... please don't ever do that again with
 * these". Z-order is how the app keeps that promise: whatever the band
 * or its glow reaches, an opaque face is drawn over it.
 *
 * Returns null whenever there is nothing to draw — no slug, no art for
 * it, or no Skia — and the caller keeps whatever it was doing before.
 * That is what lets this land without touching the flat-colour path for
 * the two hundred cosmetics still waiting their turn.
 */
export function WornRing({ ring, size }: { ring: string | null; size: number }) {
  const kit = getWornKit();
  const art = ring ? RING_ART[ring] : undefined;
  if (!kit || !art) return null;

  return <kit.Ring art={art} size={size} />;
}

/**
 * The worn aura, sized to an avatar and drawn OVER it.
 *
 * Over, because floating around somebody's picture is the entire point
 * of an aura, and the particles orbit outside the picture's edge so
 * "over" costs the face nothing. The web draws it over too. Same null
 * rules as the ring.
 */
export function WornAura({ aura, size }: { aura: string | null; size: number }) {
  const kit = getWornKit();
  const art = aura ? AURA_ART[aura] : undefined;
  if (!kit || !art) return null;

  return <kit.Aura art={art} size={size} />;
}
