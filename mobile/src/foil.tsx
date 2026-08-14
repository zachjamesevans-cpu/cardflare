import { useEffect } from "react";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * The Skia kit: real holofoil, travelling frames, and the orbit ring.
 *
 * The web builds these from CSS blend modes and keyframes; React
 * Native's view system has neither. @shopify/react-native-skia ships
 * inside Expo Go for this SDK and in every store build, and Reanimated
 * drives its properties frame by frame on the UI thread - so the app
 * runs the same recipe at the same speeds as globals.css: color-dodge
 * spectra drifting at 11s, prism gratings crossing at 10s, the
 * hard-light sweep with its long pause, stars breathing at 6s, and the
 * three travelling ring frames at their web periods (6s, 5s, 9s).
 *
 * The Skia require is guarded AND deferred, and the deferral is a
 * launch-safety decision, not style: importing Skia runs a synchronous
 * native JSI install the moment the module loads. Requiring on first
 * render keeps that outside the splash-screen window, where a failure
 * would be an app that never draws. If Skia is missing the kit is null
 * and every caller falls back to its quiet static version.
 */

export type FoilProps = {
  imageUrl: string;
  width: number;
  height: number;
  holo: "classic-holo" | "prism-holo" | "galaxy-holo";
};

/* The web palette families, restated for dodge: black stops are the
   gaps that let the art through untouched (dodge by black is a no-op),
   exactly the trick the CSS version leans on. */
const CLASSIC_COLUMNS = [
  "rgba(154,64,224,0.80)",
  "rgba(0,0,0,1)",
  "rgba(64,105,229,0.80)",
  "rgba(0,0,0,1)",
  "rgba(43,180,168,0.80)",
  "rgba(0,0,0,1)",
  "rgba(96,190,66,0.80)",
  "rgba(0,0,0,1)",
  "rgba(235,205,60,0.80)",
  "rgba(0,0,0,1)",
  "rgba(227,60,60,0.80)",
];

const PRISM_A = [
  "rgba(240,150,145,0.70)",
  "rgba(0,0,0,1)",
  "rgba(120,190,250,0.70)",
  "rgba(0,0,0,1)",
  "rgba(250,190,120,0.70)",
  "rgba(0,0,0,1)",
  "rgba(110,240,190,0.70)",
];

const PRISM_B = [
  "rgba(120,235,240,0.45)",
  "rgba(0,0,0,1)",
  "rgba(245,140,225,0.45)",
  "rgba(0,0,0,1)",
  "rgba(120,190,250,0.45)",
];

const GALAXY_STREAKS = [
  "rgba(0,0,0,1)",
  "rgba(109,74,255,0.55)",
  "rgba(0,0,0,1)",
  "rgba(210,35,150,0.45)",
  "rgba(0,0,0,1)",
  "rgba(100,55,215,0.50)",
  "rgba(0,0,0,1)",
];

/* Fixed constellations, as fractions of the card. Random stars would
   twinkle to new places on every re-render, which reads as a glitch. */
const STARS = [
  { x: 0.18, y: 0.2, r: 0.022, o: 0.9 },
  { x: 0.72, y: 0.14, r: 0.015, o: 0.7 },
  { x: 0.86, y: 0.4, r: 0.02, o: 0.8 },
  { x: 0.3, y: 0.52, r: 0.013, o: 0.6 },
  { x: 0.56, y: 0.76, r: 0.019, o: 0.85 },
  { x: 0.12, y: 0.7, r: 0.014, o: 0.6 },
  { x: 0.66, y: 0.34, r: 0.011, o: 0.5 },
  { x: 0.42, y: 0.9, r: 0.016, o: 0.7 },
];

/*
 * The travelling ring frames: the exact stops and periods of
 * cf-frame-*::before (cards, alpha 0.9) and cf-avatar-frame-*::after
 * (rings, alpha 0.95) in globals.css, driven by cf-prism-travel.
 */
const CARD_RING: Record<string, { colors: string[]; duration: number }> = {
  "prism-edge": {
    colors: [
      "rgba(0,200,255,0.9)",
      "rgba(255,0,170,0.9)",
      "rgba(140,60,255,0.9)",
      "rgba(120,255,60,0.9)",
      "rgba(255,200,0,0.9)",
      "rgba(0,200,255,0.9)",
    ],
    duration: 6000,
  },
  "molten-edge": {
    colors: [
      "rgba(255,61,0,0.9)",
      "rgba(255,138,61,0.9)",
      "rgba(255,210,61,0.9)",
      "rgba(194,65,12,0.9)",
      "rgba(255,61,0,0.9)",
    ],
    duration: 5000,
  },
  "galaxy-edge": {
    colors: [
      "rgba(58,36,128,0.95)",
      "rgba(109,74,255,0.95)",
      "rgba(255,0,170,0.85)",
      "rgba(238,238,255,0.9)",
      "rgba(58,36,128,0.95)",
    ],
    duration: 9000,
  },
};

const AVATAR_RING: Record<string, { colors: string[]; duration: number }> = {
  "prism-edge": {
    colors: [
      "rgba(0,200,255,0.95)",
      "rgba(255,0,170,0.95)",
      "rgba(140,60,255,0.95)",
      "rgba(120,255,60,0.95)",
      "rgba(255,200,0,0.95)",
      "rgba(0,200,255,0.95)",
    ],
    duration: 6000,
  },
  "molten-edge": {
    colors: [
      "rgba(255,61,0,0.95)",
      "rgba(255,138,61,0.95)",
      "rgba(255,210,61,0.95)",
      "rgba(194,65,12,0.95)",
      "rgba(255,61,0,0.95)",
    ],
    duration: 5000,
  },
  "galaxy-edge": {
    colors: [
      "rgba(58,36,128,0.95)",
      "rgba(109,74,255,0.95)",
      "rgba(255,0,170,0.85)",
      "rgba(238,238,255,0.9)",
      "rgba(58,36,128,0.95)",
    ],
    duration: 9000,
  },
};

/** True for the frames whose web version travels; the rest are static
    colour and the plain border already matches them exactly. */
export const travellingFrame = (slug: string | null): boolean =>
  slug !== null && slug in CARD_RING;

const evenly = (count: number) =>
  Array.from({ length: count }, (_, i) => i / (count - 1));

function makeKit(S: typeof import("@shopify/react-native-skia")) {
  const {
    Canvas,
    Circle,
    Group,
    Image: SkiaImage,
    LinearGradient,
    RadialGradient,
    Rect,
    RoundedRect,
    SweepGradient,
    useImage,
    vec,
  } = S;

  /** 0 -> 1 forever. Linear unless told otherwise; loops seamlessly
      because every gradient it drives repeats with a one-period tile. */
  function usePhase(duration: number, easeInOut = false, bounce = false) {
    const phase = useSharedValue(0);
    useEffect(() => {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(1, {
          duration,
          easing: easeInOut ? Easing.inOut(Easing.ease) : Easing.linear,
        }),
        -1,
        bounce,
      );
      return () => cancelAnimation(phase);
    }, [duration, easeInOut, bounce, phase]);
    return phase;
  }

  /** The 115deg-ish axis every travelling gradient slides along. */
  const axis = (w: number, h: number) => ({ dx: w, dy: h * 0.32 });

  function Foil({ imageUrl, width, height, holo }: FoilProps) {
    const image = useImage(imageUrl);

    const w = width;
    const h = height;
    const { dx, dy } = axis(w, h);

    /* cf-foil-drift 11s (classic) / 13s (galaxy); cross 10s alternate. */
    const drift = usePhase(holo === "galaxy-holo" ? 13000 : 11000);
    const cross = usePhase(10000, true, true);

    /* cf-foil-sweep: across in the first 45%, then a long hold. */
    const sweepPhase = useSharedValue(0);
    useEffect(() => {
      sweepPhase.value = 0;
      sweepPhase.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.ease) }),
          withDelay(4400, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
      return () => cancelAnimation(sweepPhase);
    }, [sweepPhase]);

    /* cf-star-breathe: 6s ease, opacity 0.55 <-> 1. */
    const breathe = usePhase(3000, true, true);

    const columnsStart = useDerivedValue(() => ({ x: -dx * drift.value, y: h * 0.08 - dy * drift.value }));
    const columnsEnd = useDerivedValue(() => ({ x: w - dx * drift.value, y: h * 0.4 - dy * drift.value }));

    const crossAStart = useDerivedValue(() => ({ x: dx * cross.value, y: dy * cross.value }));
    const crossAEnd = useDerivedValue(() => ({ x: w + dx * cross.value, y: h + dy * cross.value }));
    const crossBStart = useDerivedValue(() => ({ x: w + dx * cross.value, y: -dy * cross.value }));
    const crossBEnd = useDerivedValue(() => ({ x: dx * cross.value, y: h - dy * cross.value }));

    const sweepStart = useDerivedValue(() => ({ x: -w * 1.4 + sweepPhase.value * 2.4 * w, y: h * 0.25 }));
    const sweepEnd = useDerivedValue(() => ({ x: -w * 0.4 + sweepPhase.value * 2.4 * w, y: h * 0.75 }));

    const starsOpacity = useDerivedValue(() => 0.55 + 0.45 * breathe.value);

    /* Until the art decodes, show nothing: the plain RN Image sits
       underneath, so the card is never blank, just briefly matte. */
    if (!image) return null;

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="cover" />

        {holo === "classic-holo" && (
          <>
            {/* Spectral columns, dodged, drifting at the web's 11s. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="colorDodge">
              <LinearGradient
                start={columnsStart}
                end={columnsEnd}
                colors={CLASSIC_COLUMNS}
                positions={evenly(CLASSIC_COLUMNS.length)}
                mode="repeat"
              />
            </Rect>
            {/* Screen wash so the foil still shows on dark card faces. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="screen">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(w, h)}
                colors={[
                  "rgba(255,255,255,0.14)",
                  "rgba(255,255,255,0.02)",
                  "rgba(255,255,255,0.10)",
                ]}
              />
            </Rect>
            {/* The specular band: across, then the long pause. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="hardLight">
              <LinearGradient
                start={sweepStart}
                end={sweepEnd}
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.22)",
                  "rgba(255,255,255,0)",
                ]}
                positions={[0.38, 0.5, 0.62]}
              />
            </Rect>
          </>
        )}

        {holo === "prism-holo" && (
          <>
            {/* Two gratings crossing at right angles, sliding against
                each other - cf-foil-cross, 10s, alternating. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="colorDodge">
              <LinearGradient
                start={crossAStart}
                end={crossAEnd}
                colors={PRISM_A}
                positions={evenly(PRISM_A.length)}
                mode="repeat"
              />
            </Rect>
            <Rect x={0} y={0} width={w} height={h} blendMode="colorDodge">
              <LinearGradient
                start={crossBStart}
                end={crossBEnd}
                colors={PRISM_B}
                positions={evenly(PRISM_B.length)}
                mode="repeat"
              />
            </Rect>
            {/* The pastel wash, screened at the web's 55deg. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="screen">
              <LinearGradient
                start={vec(0, h)}
                end={vec(w, 0)}
                colors={[
                  "rgba(240,150,145,0.16)",
                  "rgba(120,190,250,0.16)",
                  "rgba(245,140,225,0.16)",
                ]}
              />
            </Rect>
          </>
        )}

        {holo === "galaxy-holo" && (
          <>
            {/* Deep-space vignette: multiply darkens the edges first. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="multiply">
              <RadialGradient
                c={vec(w * 0.5, h * 0.45)}
                r={Math.max(w, h) * 0.75}
                colors={[
                  "rgba(255,255,255,1)",
                  "rgba(58,36,128,0.9)",
                  "rgba(12,6,32,0.95)",
                ]}
                positions={[0.35, 0.75, 1]}
              />
            </Rect>
            {/* The nebula, hard-light so it colours without flattening. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="hardLight">
              <RadialGradient
                c={vec(w * 0.32, h * 0.35)}
                r={w * 0.7}
                colors={[
                  "rgba(109,74,255,0.55)",
                  "rgba(210,35,150,0.30)",
                  "rgba(0,0,0,0)",
                ]}
              />
            </Rect>
            {/* Streaks drifting at the web's 13s, dodged bright. */}
            <Rect x={0} y={0} width={w} height={h} blendMode="colorDodge">
              <LinearGradient
                start={columnsStart}
                end={columnsEnd}
                colors={GALAXY_STREAKS}
                positions={evenly(GALAXY_STREAKS.length)}
                mode="repeat"
              />
            </Rect>
            {/* Stars breathing together at 6s, screened on top. */}
            <Group opacity={starsOpacity} blendMode="screen">
              {STARS.map((star, index) => (
                <Circle
                  key={index}
                  cx={star.x * w}
                  cy={star.y * h}
                  r={Math.max(1, star.r * w)}
                  color="white"
                  opacity={star.o}
                />
              ))}
            </Group>
          </>
        )}
      </Canvas>
    );
  }

  /** A travelling 2px ring on a card - cf-frame-*::before, exactly. */
  function FrameRing({
    width,
    height,
    slug,
    radius = 6,
  }: {
    width: number;
    height: number;
    slug: string;
    radius?: number;
  }) {
    const spec = CARD_RING[slug];
    const { dx, dy } = axis(width, height);
    const phase = usePhase(spec?.duration ?? 6000);

    const start = useDerivedValue(() => ({ x: -dx * phase.value, y: -dy * phase.value }));
    const end = useDerivedValue(() => ({ x: width - dx * phase.value, y: height * 0.32 - dy * phase.value }));

    if (!spec) return null;

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <RoundedRect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          r={radius}
          style="stroke"
          strokeWidth={2}
        >
          <LinearGradient
            start={start}
            end={end}
            colors={spec.colors}
            positions={evenly(spec.colors.length)}
            mode="repeat"
          />
        </RoundedRect>
      </Canvas>
    );
  }

  /** The travelling band on a profile picture - cf-avatar-frame-*::after. */
  function AvatarRing({ size, slug }: { size: number; slug: string }) {
    const spec = AVATAR_RING[slug];
    const { dx, dy } = axis(size, size);
    const phase = usePhase(spec?.duration ?? 6000);

    const start = useDerivedValue(() => ({ x: -dx * phase.value, y: -dy * phase.value }));
    const end = useDerivedValue(() => ({ x: size - dx * phase.value, y: size * 0.32 - dy * phase.value }));

    if (!spec) return null;

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width: size, height: size }}
        pointerEvents="none"
      >
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} style="stroke" strokeWidth={2}>
          <LinearGradient
            start={start}
            end={end}
            colors={spec.colors}
            positions={evenly(spec.colors.length)}
            mode="repeat"
          />
        </Circle>
      </Canvas>
    );
  }

  /** The orbit effect: a bright segment circling the card at the web's
      3.2s - a real conic this time, not four bars taking turns. */
  function OrbitRing({
    width,
    height,
    color,
    radius = 6,
  }: {
    width: number;
    height: number;
    color: string;
    radius?: number;
  }) {
    const phase = usePhase(3200);
    const transform = useDerivedValue(() => [{ rotate: phase.value * Math.PI * 2 }]);

    return (
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        pointerEvents="none"
      >
        <Group origin={vec(width / 2, height / 2)} transform={transform}>
          <RoundedRect
            x={1.5}
            y={1.5}
            width={width - 3}
            height={height - 3}
            r={radius}
            style="stroke"
            strokeWidth={3}
          >
            <SweepGradient
              c={vec(width / 2, height / 2)}
              colors={[color, "rgba(0,0,0,0)", "rgba(0,0,0,0)", color]}
              positions={[0, 0.22, 0.97, 1]}
            />
          </RoundedRect>
        </Group>
      </Canvas>
    );
  }

  return { Foil, FrameRing, AvatarRing, OrbitRing };
}

export type FoilKit = ReturnType<typeof makeKit>;

/* undefined = not tried yet; null = tried and Skia is not usable. */
let cached: FoilKit | null | undefined;

/**
 * The kit, or null when Skia is not in this binary. The first call pays
 * the require and the native install; every later call returns the same
 * components, so React sees stable identities.
 */
export function getFoilKit(): FoilKit | null {
  if (cached === undefined) {
    try {
      cached = makeKit(require("@shopify/react-native-skia"));
    } catch {
      cached = null;
    }
  }
  return cached;
}
