import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { BORDER_ART, type BorderArt } from "./cosmetic-art-data";

/**
 * The 43 card borders, drawn on a phone.
 *
 * The biggest catalogue family and the one on every card in a showcase,
 * and until now the app drew none of them: it dressed cards with the
 * nine LEGACY frames and had no idea the other forty-three existed,
 * because the server never sent the slug. Somebody could buy Rainbow,
 * wear it on the website, and open the app to a plain grey card.
 *
 * The web paints the edge as the card's own padding: a gradient behind
 * a face inset by four points, plus a `box-shadow` glow and sometimes
 * an `inset` hairline. React Native has gradients but not conic ones,
 * not repeating ones, and no way to pan a background, so this is Skia -
 * the same bargain the foil and the worn rings make, and the same
 * guarded, deferred require, so a binary without Skia keeps the flat
 * fallback instead of failing to launch.
 *
 * Every number comes from `cosmetic-art-data.ts`, which is generated
 * out of the website's stylesheet. Nothing here transcribes a colour.
 */

type Skia = typeof import("@shopify/react-native-skia");

/**
 * The edge, in points, and the corners either side of it.
 *
 * The website's `.cfx-card` is `padding: 4px; border-radius: 12px` over
 * a face at `border-radius: 9px`. Four points is deliberately chunkier
 * than the two a legacy frame draws: these are the ones people spend
 * Embers on and they are meant to read across a table.
 */
export const EDGE = 4;
export const EDGE_RADIUS = 10;
export const FACE_RADIUS = EDGE_RADIUS - EDGE;

/** CSS's gradient line: 0deg points up, and degrees run clockwise. */
function direction(angle: number): { dx: number; dy: number } {
  const radians = (angle * Math.PI) / 180;
  return { dx: Math.sin(radians), dy: -Math.cos(radians) };
}

function makeKit(S: Skia) {
  const { Canvas, Group, LinearGradient, RoundedRect, rrect, rect, vec } = S;

  function Edge({
    art,
    width,
    height,
  }: {
    art: BorderArt;
    width: number;
    height: number;
  }) {
    const clock = useSharedValue(0);
    const motion = art.motion;

    useEffect(() => {
      if (!motion) return;

      clock.value = 0;
      clock.value = withRepeat(
        withTiming(1, {
          duration: motion.seconds * 1000,
          easing: motion.kind === "pulse" ? Easing.inOut(Easing.ease) : Easing.linear,
        }),
        -1,
        /* `alternate` in the stylesheet is a ping-pong, and the three
           flame borders rely on it: their gradients do not start and
           end in the same colour, so they travel out and back rather
           than wrapping through a seam. */
        motion.kind === "pulse" ? true : motion.alternate,
      );

      return () => cancelAnimation(clock);
    }, [motion, clock]);

    const { base } = art;
    const angle = base.type === "radial" ? 0 : base.angle;
    const { dx, dy } = direction(angle);

    /*
     * How long one run of the gradient is.
     *
     * A repeating border states its own period in points. Everything
     * else is measured against the box `background-size` gives it -
     * Rainbow is three cards wide and slides - falling back to the card
     * itself for a border that holds still.
     */
    const span =
      base.type === "repeat"
        ? base.periodPx
        : Math.abs(width * (art.spread?.x ?? 1) * dx) +
          Math.abs(height * (art.spread?.y ?? 1) * dy);

    const travels =
      motion !== null && (motion.kind === "pan" || motion.kind === "pan-y");
    const centre = { x: width / 2, y: height / 2 };

    /* One full span per cycle, so a looping gradient meets itself. */
    const slide = useDerivedValue(() => (travels ? -span * clock.value : 0));

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

    /* `cfa-pulse` is 0.55 to 1 and back; `cfa-jitter` is a couple of
       points of shake, four times near the end of its cycle. */
    const opacity = useDerivedValue(() =>
      motion?.kind === "pulse" ? 0.55 + 0.45 * clock.value : 1,
    );
    const shake = useDerivedValue(() => {
      if (motion?.kind !== "jitter") return [{ translateX: 0 }, { translateY: 0 }];
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

    return (
      <Canvas style={{ position: "absolute", width, height }} pointerEvents="none">
        <Group opacity={opacity} transform={shake}>
          <RoundedRect
            rect={rrect(rect(0, 0, width, height), EDGE_RADIUS, EDGE_RADIUS)}
          >
            <LinearGradient
              start={start}
              end={end}
              colors={base.colors}
              positions={base.positions}
              /* A still border is one gradient across the card. A
                 moving or repeating one tiles, or it would run out of
                 colour the moment it slid. */
              mode={travels || base.type === "repeat" ? "repeat" : "clamp"}
            />
          </RoundedRect>
        </Group>
      </Canvas>
    );
  }

  return { Edge };
}

export type EdgeKit = ReturnType<typeof makeKit>;

let cached: EdgeKit | null | undefined;

/** The kit, or null on a device where Skia will not load. */
export function getEdgeKit(): EdgeKit | null {
  if (cached === undefined) {
    try {
      cached = makeKit(require("@shopify/react-native-skia"));
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Whether a slug is one the app draws rather than approximates. */
export function drawsBorder(slug: string | null): boolean {
  return Boolean(slug && slug in BORDER_ART && getEdgeKit() !== null);
}

/**
 * The glow and hairline a border carries, as React Native style.
 *
 * Kept out of Skia on purpose: a shadow on the view is one cheap
 * platform blur, where a blurred copy inside the canvas would need the
 * canvas to be bigger than the card and every card in a showcase rail
 * to pay for the margin.
 */
export function borderStyle(slug: string | null): ViewStyle | null {
  const art = slug ? BORDER_ART[slug] : undefined;
  if (!art) return null;

  return {
    ...(art.glow
      ? {
          shadowColor: art.glow.color,
          shadowOpacity: 1,
          shadowRadius: art.glow.radius,
          shadowOffset: { width: 0, height: 0 },
        }
      : {}),
    ...(art.hairline
      ? { borderWidth: art.hairline.width, borderColor: art.hairline.color }
      : {}),
  };
}

/**
 * A card's worn edge, sized to it.
 *
 * Absolutely positioned and drawn UNDER whatever the caller puts on
 * top, exactly like the website's padding: the face sits inset by
 * `EDGE` and the border is what shows around it. Returns null for a
 * slug with no art and on any device without Skia, so a card wearing
 * something unported keeps the plain frame it had.
 */
export function CardEdge({
  border,
  width,
  height,
}: {
  border: string | null;
  width: number;
  height: number;
}) {
  const kit = getEdgeKit();
  const art = border ? BORDER_ART[border] : undefined;
  if (!kit || !art) return null;

  return <kit.Edge art={art} width={width} height={height} />;
}

/** A plain view sized to the face a border leaves room for. */
export function faceInset(width: number, height: number): ViewStyle {
  return {
    position: "absolute",
    left: EDGE,
    top: EDGE,
    width: width - EDGE * 2,
    height: height - EDGE * 2,
    borderRadius: FACE_RADIUS,
    overflow: "hidden",
  };
}
