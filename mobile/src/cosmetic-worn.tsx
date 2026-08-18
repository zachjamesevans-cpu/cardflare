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

import {
  AURA_ART,
  RING_ART,
  type AuraArt,
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

/** Where the band sits, as fractions of the avatar box. */
const BAND_INSET = 0.02;
const BAND_WIDTH = 0.055;

function makeKit(S: Skia) {
  const { Canvas, Circle, Group, SweepGradient, vec } = S;

  /**
   * The ring: a stroked circle filled with a turning sweep gradient.
   *
   * Stroked rather than two filled circles, because a stroke is one draw
   * call and this sits behind every avatar in a room roster. A shop's
   * Friday night can put a dozen of these on one screen.
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

    const centre = size / 2;
    const radius = centre - size * BAND_INSET - (size * BAND_WIDTH) / 2;

    return (
      <Canvas style={{ width: size, height: size }} pointerEvents="none">
        <Group origin={vec(centre, centre)} transform={spin}>
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            style="stroke"
            strokeWidth={size * BAND_WIDTH}
          >
            <SweepGradient
              c={vec(centre, centre)}
              colors={art.colors}
              positions={art.positions}
            />
          </Circle>
        </Group>
      </Canvas>
    );
  }

  /**
   * The aura: a field of particles orbiting the picture.
   *
   * One shared clock rather than one per particle. Each particle reads
   * the same value at its own offset, so an aura of sixteen is one
   * animation, not sixteen — which is what keeps a roster cheap.
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

    const centre = size / 2;
    const orbit = centre * 0.88;
    const dot = Math.max(1.5, size * art.scale);

    return (
      <Canvas style={{ width: size, height: size }} pointerEvents="none">
        {Array.from({ length: art.count }, (_, index) => (
          <Particle
            key={index}
            index={index}
            art={art}
            clock={clock}
            centre={centre}
            orbit={orbit}
            dot={dot}
          />
        ))}
      </Canvas>
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
  }: {
    index: number;
    art: AuraArt;
    clock: ReturnType<typeof useSharedValue<number>>;
    centre: number;
    orbit: number;
    dot: number;
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
          /* Up the outside and away, which is what a spark does. */
          return { x: centre + Math.cos(angle) * orbit, y: centre + orbit - t * orbit * 2 };
        case "fall":
          return { x: centre + Math.cos(angle) * orbit, y: centre - orbit + t * orbit * 2 };
        case "drift": {
          const a = angle + t * Math.PI * 2;
          return { x: centre + Math.cos(a) * orbit, y: centre + Math.sin(a) * orbit };
        }
        default:
          /* Twinkle and flicker stay put and change opacity instead. */
          return { x: centre + Math.cos(angle) * orbit, y: centre + Math.sin(angle) * orbit };
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

    return <Circle cx={cx} cy={cy} r={dot} color={colour} opacity={opacity} />;
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
 * The worn ring and aura, sized to an avatar.
 *
 * Returns null whenever there is nothing to draw — no slug, no art for
 * it, or no Skia — and the caller keeps whatever it was doing before.
 * That is what lets this land without touching the flat-colour path for
 * the two hundred cosmetics still waiting their turn.
 */
export function WornCosmetics({
  ring,
  aura,
  size,
}: {
  ring: string | null;
  aura: string | null;
  size: number;
}) {
  const kit = getWornKit();
  if (!kit) return null;

  const ringArt = ring ? RING_ART[ring] : undefined;
  const auraArt = aura ? AURA_ART[aura] : undefined;
  if (!ringArt && !auraArt) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size }}
    >
      {auraArt && <kit.Aura art={auraArt} size={size} />}
      {ringArt && (
        <View style={{ position: "absolute", width: size, height: size }}>
          <kit.Ring art={ringArt} size={size} />
        </View>
      )}
    </View>
  );
}
