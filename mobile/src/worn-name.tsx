import { useEffect, useMemo } from "react";
import { Platform, Text, View, type TextStyle } from "react-native";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import {
  BADGE_ART,
  NAME_ART,
  TITLE_ART,
  hasNameArt,
  type NameArt,
} from "./cosmetic-art-data";
import { BADGE_MARK_FALLBACK, BADGE_MARKS, titleWords } from "./worn-words";
import { colors } from "./theme";

/**
 * A player's identity, wearing what they bought: the name style, the
 * badge beside it, the title under it.
 *
 * The website's `WornNameRow` in the shapes React Native can express.
 * Twenty-eight cosmetics lived only on the web before this - a name
 * style equipped there simply did not exist on a phone.
 *
 * Three kinds of drawing, chosen per cosmetic by the generated data:
 *
 * - A SOLID name is a styled <Text>: colour, glow, the pixel and manga
 *   font swaps. Cheap and everywhere.
 * - A GRADIENT name needs Skia, because React Native has no
 *   `background-clip: text` - the glyphs themselves are painted with a
 *   gradient shader, and Shimmer and Holographic pan it at the web's
 *   own period. Skia missing? The first gradient stop stands in as a
 *   solid, which is the same bargain every other cosmetic family makes.
 * - Badges and title chips are ordinary views: a gradient pill with its
 *   mark, a recoloured chip with its words.
 *
 * One honest approximation, recorded rather than hidden: React Native's
 * Text carries exactly ONE shadow, so Pixel's two-layer offset depth and
 * Glitch's cyan/magenta split draw their first layer only.
 */

type Skia = typeof import("@shopify/react-native-skia");

function makeKit(S: Skia) {
  const {
    Canvas,
    Group,
    LinearGradient: SkiaGradient,
    Text: SkiaText,
    matchFont,
    vec,
  } = S;

  /** The glyphs, painted with the gradient the stylesheet describes. */
  function GradientName({
    name,
    art,
    fontSize,
  }: {
    name: string;
    art: NameArt & { fill: { type: "gradient" } };
    fontSize: number;
  }) {
    const font = useMemo(
      () =>
        matchFont({
          fontFamily: Platform.select({ ios: "Helvetica Neue", default: "sans-serif" }),
          fontSize,
          fontWeight: "800",
          fontStyle: art.italic ? "italic" : "normal",
        }),
      [fontSize, art.italic],
    );

    const width = useMemo(() => {
      const measured = font.measureText(name).width;
      /* A missing glyph measures 0; a canvas of width 0 draws nothing
         and hides the name entirely, which is worse than any fallback. */
      return Math.max(measured, fontSize);
    }, [font, name, fontSize]);

    const { fill } = art;
    const travels = art.motion?.kind === "pan" && fill.spread > 1;
    const clock = useSharedValue(0);

    useEffect(() => {
      if (!travels || !art.motion) return;

      clock.value = 0;
      clock.value = withRepeat(
        withTiming(1, {
          duration: art.motion.seconds * 1000,
          easing: Easing.linear,
        }),
        -1,
        false,
      );

      return () => cancelAnimation(clock);
    }, [travels, art.motion, clock]);

    /* The paint is `spread` names wide and slides through, exactly the
       web's background-size + cfa-pan. A still gradient spans the name
       once. */
    const paintWidth = width * fill.spread;
    const start = useDerivedValue(() => vec(-clock.value * (paintWidth - width), 0));
    const end = useDerivedValue(() =>
      vec(paintWidth - clock.value * (paintWidth - width), fontSize * 0.4),
    );

    const height = Math.ceil(fontSize * 1.35);

    return (
      <Canvas style={{ width, height }} pointerEvents="none">
        <Group>
          <SkiaText x={0} y={fontSize} text={name} font={font}>
            <SkiaGradient
              start={start}
              end={end}
              colors={fill.colors}
              positions={fill.positions}
            />
          </SkiaText>
        </Group>
      </Canvas>
    );
  }

  return { GradientName };
}

type NameKit = ReturnType<typeof makeKit>;

let cached: NameKit | null | undefined;

function getNameKit(): NameKit | null {
  if (cached === undefined) {
    try {
      cached = makeKit(require("@shopify/react-native-skia"));
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** The font stack a name style asks for, in RN's vocabulary. */
function fontFamilyFor(art: NameArt): string | undefined {
  if (art.font === "mono") {
    return Platform.select({ ios: "Courier New", default: "monospace" });
  }
  if (art.font === "serif") {
    return Platform.select({ ios: "Georgia", default: "serif" });
  }
  return undefined;
}

/**
 * A display name, wearing its style.
 *
 * Degrades to a plain <Text> in `baseStyle` when nothing is worn or
 * nothing can be drawn, so screens without equips render exactly as
 * they did before this existed.
 */
export function WornName({
  name,
  nameplate,
  fontSize = 22,
  baseStyle,
}: {
  name: string;
  nameplate: string | null | undefined;
  fontSize?: number;
  baseStyle?: TextStyle;
}) {
  const art = nameplate && hasNameArt(nameplate) ? NAME_ART[nameplate] : null;

  if (!art) {
    return (
      <Text numberOfLines={1} style={baseStyle}>
        {name}
      </Text>
    );
  }

  /* The one shadow RN can carry: a soft zero-offset layer is the glow;
     otherwise the first hard layer stands for the stack. */
  const shadow = art.shadows.find((layer) => layer.blur > 0) ?? art.shadows[0];
  const shadowStyle: TextStyle = shadow
    ? {
        textShadowColor: shadow.color,
        textShadowRadius: shadow.blur,
        textShadowOffset: { width: shadow.x, height: shadow.y },
      }
    : {};

  if (art.fill.type === "gradient") {
    const kit = getNameKit();

    if (kit) {
      return (
        <GradientHost>
          <kit.GradientName
            name={name}
            art={art as NameArt & { fill: { type: "gradient" } }}
            fontSize={fontSize}
          />
        </GradientHost>
      );
    }

    /* No Skia: the most vivid stop as a solid, same bargain as foil. */
    return (
      <Text
        numberOfLines={1}
        style={[
          baseStyle,
          { color: art.fill.colors[Math.floor(art.fill.colors.length / 2)] },
          shadowStyle,
        ]}
      >
        {name}
      </Text>
    );
  }

  return (
    <Text
      numberOfLines={1}
      style={[
        baseStyle,
        {
          color: art.fill.color,
          fontFamily: fontFamilyFor(art),
          fontStyle: art.italic ? "italic" : "normal",
          letterSpacing: art.letterSpacingEm
            ? art.letterSpacingEm * fontSize
            : undefined,
        },
        shadowStyle,
      ]}
    >
      {name}
    </Text>
  );
}

/** Keeps a Skia canvas from stretching the row it sits in. */
function GradientHost({ children }: { children: React.ReactNode }) {
  return <View style={{ flexShrink: 1 }}>{children}</View>;
}

/** The badge beside a name: the web's gradient pill and its mark. */
export function WornBadge({ badge }: { badge: string | null | undefined }) {
  const art = badge ? BADGE_ART[badge] : undefined;
  if (!badge || !art) return null;

  /* CSS 140deg, as start/end points on the unit square. */
  const radians = ((art.angle - 90) * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;

  return (
    <LinearGradient
      colors={art.colors as [string, string, ...string[]]}
      start={{ x: 0.5 - dx, y: 0.5 - dy }}
      end={{ x: 0.5 + dx, y: 0.5 + dy }}
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        ...(art.glow
          ? {
              shadowColor: art.glow.color,
              shadowOpacity: 1,
              shadowRadius: art.glow.radius,
              shadowOffset: { width: 0, height: 0 },
            }
          : {}),
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "800",
          color: art.textColor ?? "#0e1116",
        }}
      >
        {BADGE_MARKS[badge] ?? BADGE_MARK_FALLBACK}
      </Text>
    </LinearGradient>
  );
}

/** The title chip under a name: the scaffold, recoloured. */
export function WornTitle({ title }: { title: string | null | undefined }) {
  if (!title) return null;

  const art = TITLE_ART[title];
  const glow = art?.shadows.find((layer) => layer.blur > 0);

  return (
    <View
      style={{
        alignSelf: "center",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: art?.borderColor ?? colors.borderStrong,
        backgroundColor: colors.elevated,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: art?.color ?? colors.textSecondary,
          fontStyle: art?.italic ? "italic" : "normal",
          ...(glow
            ? {
                textShadowColor: glow.color,
                textShadowRadius: glow.blur,
                textShadowOffset: { width: 0, height: 0 },
              }
            : {}),
        }}
      >
        {titleWords(title)}
      </Text>
    </View>
  );
}
