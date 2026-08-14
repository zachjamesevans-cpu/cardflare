/**
 * Real holofoil for the app, at last.
 *
 * The web foil is built from CSS blend modes: color-dodge for the
 * spectral pass, screen to lift dark card faces, hard-light for the
 * sweep. React Native's own view system has none of those, which is why
 * cosmetic-card.tsx carries a translucent-gradient approximation. But
 * @shopify/react-native-skia ships inside Expo Go for this SDK and in
 * every dev-client/TestFlight build, and Skia has the full blend-mode
 * set. So: draw the card art on a Skia canvas and run the same layer
 * recipe as globals.css over it.
 *
 * The require is guarded because the one place Skia can be missing is a
 * binary built without it. There the export is null and the caller
 * falls back to the gradient wash - quieter, never broken.
 *
 * Static on purpose. Skia v2 animates through Reanimated, which is a
 * dependency this app does not carry, and a foil that holds still is
 * exactly what the web version looks like between pointer movements.
 */

let Skia: typeof import("@shopify/react-native-skia") | null = null;
try {
  Skia = require("@shopify/react-native-skia");
} catch {
  Skia = null;
}

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

const evenly = (count: number) =>
  Array.from({ length: count }, (_, i) => i / (count - 1));

function makeFoil(S: NonNullable<typeof Skia>) {
  const {
    Canvas,
    Image: SkiaImage,
    Rect,
    Circle,
    LinearGradient,
    RadialGradient,
    useImage,
    vec,
  } = S;

  return function SkiaFoil({ imageUrl, width, height, holo }: FoilProps) {
    const image = useImage(imageUrl);
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
            {/* Spectral columns, dodged. The slight tilt is the web's 115deg. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="colorDodge">
              <LinearGradient
                start={vec(0, height * 0.08)}
                end={vec(width, height * 0.4)}
                colors={CLASSIC_COLUMNS}
                positions={evenly(CLASSIC_COLUMNS.length)}
              />
            </Rect>
            {/* Screen wash so the foil still shows on dark card faces. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="screen">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, height)}
                colors={[
                  "rgba(255,255,255,0.14)",
                  "rgba(255,255,255,0.02)",
                  "rgba(255,255,255,0.10)",
                ]}
              />
            </Rect>
            {/* The specular band the web version sweeps; held mid-card here. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="hardLight">
              <LinearGradient
                start={vec(-width * 0.2, height * 0.25)}
                end={vec(width * 1.2, height * 0.75)}
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
            {/* Two gratings crossing at right angles make the diamonds. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="colorDodge">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, height)}
                colors={PRISM_A}
                positions={evenly(PRISM_A.length)}
              />
            </Rect>
            <Rect x={0} y={0} width={width} height={height} blendMode="colorDodge">
              <LinearGradient
                start={vec(width, 0)}
                end={vec(0, height)}
                colors={PRISM_B}
                positions={evenly(PRISM_B.length)}
              />
            </Rect>
            {/* The pastel wash, screened at the web's 55deg. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="screen">
              <LinearGradient
                start={vec(0, height)}
                end={vec(width, 0)}
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
            <Rect x={0} y={0} width={width} height={height} blendMode="multiply">
              <RadialGradient
                c={vec(width * 0.5, height * 0.45)}
                r={Math.max(width, height) * 0.75}
                colors={["rgba(255,255,255,1)", "rgba(58,36,128,0.9)", "rgba(12,6,32,0.95)"]}
                positions={[0.35, 0.75, 1]}
              />
            </Rect>
            {/* The nebula, hard-light so it colours without flattening. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="hardLight">
              <RadialGradient
                c={vec(width * 0.32, height * 0.35)}
                r={width * 0.7}
                colors={[
                  "rgba(109,74,255,0.55)",
                  "rgba(210,35,150,0.30)",
                  "rgba(0,0,0,0)",
                ]}
              />
            </Rect>
            {/* Streaks at the web's 82deg, dodged bright. */}
            <Rect x={0} y={0} width={width} height={height} blendMode="colorDodge">
              <LinearGradient
                start={vec(width * 0.1, 0)}
                end={vec(width * 0.9, height)}
                colors={GALAXY_STREAKS}
                positions={evenly(GALAXY_STREAKS.length)}
              />
            </Rect>
            {/* And the stars, screened on top of everything. */}
            {STARS.map((star, index) => (
              <Circle
                key={index}
                cx={star.x * width}
                cy={star.y * height}
                r={Math.max(1, star.r * width)}
                color="white"
                opacity={star.o}
                blendMode="screen"
              />
            ))}
          </>
        )}
      </Canvas>
    );
  };
}

/** Null when the Skia native module is not in this binary. */
export const SkiaFoil = Skia ? makeFoil(Skia) : null;
