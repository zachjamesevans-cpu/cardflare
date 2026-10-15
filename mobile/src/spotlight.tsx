import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { SPOTLIGHT_DISMISS, SPOTLIGHT_LINE } from "./intro-copy";
import { colors, radius, spacing } from "./theme";

/**
 * The one-time highlight on the Feed's +, after a new player's intro.
 *
 * The founder: "highlighting the post a flare button". Since the Flare
 * tab left the dock, the + at the top left of the Feed is the way to
 * post, and the easiest thing on the screen to miss on a first visit.
 * So the screen dims around it, a ring sits on it, and one line says
 * what it is for. Any tap closes it; a tap on the + itself opens the
 * composer as well. It shows once, and only when the intro asked for it
 * ("Look around first") - never to somebody who simply updated the app.
 */

const PENDING_KEY = "cf-spotlight-post";
/** How far the ring stands off the button. */
const RING_PAD = 6;

/* --- The target: whatever the Feed's + is drawn in. ---------------- */

let target: React.RefObject<View | null> | null = null;

/** Marks the view the spotlight points at. One target: the +. */
export function useSpotlightTarget(): React.RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    target = ref;
    return () => {
      if (target === ref) target = null;
    };
  }, []);
  return ref;
}

/* --- Pending: asked for by the intro, shown once. ------------------- */

const listeners = new Set<() => void>();

export async function queueSpotlight(): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_KEY, "1");
  } catch {
    /* A nicety: if it cannot be stored, the Feed just opens plain. */
  }
  for (const listener of listeners) listener();
}

async function takeSpotlight(): Promise<boolean> {
  try {
    if ((await SecureStore.getItemAsync(PENDING_KEY)) !== "1") return false;
    await SecureStore.deleteItemAsync(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

interface Hole {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Drawn by the Feed. Waits for a queued spotlight, measures the +, and
 * covers the window around it.
 */
export function Spotlight({ onOpen }: { onOpen: () => void }) {
  const [hole, setHole] = useState<Hole | null>(null);
  const window = useWindowDimensions();

  useEffect(() => {
    let live = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const measure = () =>
      target?.current?.measureInWindow((x, y, width, height) => {
        if (!live || width <= 0) return;
        setHole((last) =>
          last &&
          last.x === x &&
          last.y === y &&
          last.width === width &&
          last.height === height
            ? last
            : { x, y, width, height },
        );
      });
    const check = () => {
      void takeSpotlight().then((due) => {
        if (!due || !live) return;
        /*
         * Measured again for the first few seconds, not once. The Feed
         * is often still settling when it is due - a sheet closing over
         * it, the header easing in - and a single early reading left
         * the ring a header's height above the +.
         */
        for (let at = 700; at <= 3500; at += 350) timers.push(setTimeout(measure, at));
      });
    };
    check();
    listeners.add(check);
    return () => {
      live = false;
      listeners.delete(check);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (!hole) return null;

  const size = Math.max(hole.width, hole.height) + RING_PAD * 2;
  const ring = {
    left: hole.x + hole.width / 2 - size / 2,
    top: hole.y + hole.height / 2 - size / 2,
    size,
  };
  const close = () => setHole(null);


  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      {/* Any tap closes it. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />

      {/*
       * THE DIM, WITH A ROUND HOLE. It was four rectangles around the
       * ring, which left a square of undimmed page around a round ring -
       * the founder: "see how there's a square around the icon ... just
       * make it a circle ... it's like clipping over your circle." Now one
       * Skia shape: the window, less the ring's circle (even-odd fill),
       * so the page shows through that circle and nowhere else. A border
       * as thick as the screen was tried first; iOS drew none of it.
       */}
      <HoleDim
        width={window.width}
        height={window.height}
        hole={{
          x: ring.left,
          y: ring.top,
          width: ring.size,
          height: ring.size,
          radius: ring.size / 2,
        }}
      />

      {/* The ring, and a tap on it opens the composer. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Post a Flare"
        onPress={() => {
          close();
          onOpen();
        }}
        style={[
          styles.ring,
          {
            left: ring.left,
            top: ring.top,
            width: ring.size,
            height: ring.size,
            borderRadius: ring.size / 2,
          },
        ]}
      />

      {/* The line, under the ring, held inside the screen's edges. */}
      <View
        style={[
          styles.bubble,
          {
            top: ring.top + ring.size + spacing(3),
            left: spacing(4),
            maxWidth: Math.min(320, window.width - spacing(8)),
          },
        ]}
        pointerEvents="box-none"
      >
        <Text style={styles.line}>{SPOTLIGHT_LINE}</Text>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
          <Text style={styles.dismiss}>{SPOTLIGHT_DISMISS}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * The scrim with a circle cut out of it. Skia is loaded here, when a
 * spotlight shows, never at launch: the launch path loads no Skia
 * (welcome.tsx says why), and the cosmetics load it the same lazy way.
 */
/** A hole in the dim: a rounded rectangle, a circle when the radius is
    half its size. */
export interface DimHole {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * The scrim with a hole cut out of it: the window less the hole, filled
 * even-odd. Shared by this spotlight and the profile tour
 * (tour.tsx). Skia is loaded here, when one shows, never at
 * launch: the launch path loads no Skia (welcome.tsx says why), and the
 * cosmetics load it the same lazy way.
 */
export function HoleDim({
  width,
  height,
  hole,
}: {
  width: number;
  height: number;
  hole: DimHole;
}) {
  const { Canvas, Path } =
    require("@shopify/react-native-skia") as typeof import("@shopify/react-native-skia");
  const { x, y, width: w, height: h } = hole;
  const r = Math.min(hole.radius, w / 2, h / 2);
  const shape =
    `M0 0 H${width} V${height} H0 Z ` +
    `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
    `V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
    `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  return (
    /* The wrapper lets taps through to what is under the dim: a Skia
       canvas takes them itself, whatever its own pointerEvents say. */
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={shape} fillType="evenOdd" color={colors.scrim} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    borderWidth: 2,
    get borderColor() {
      return colors.accent;
    },
    get shadowColor() {
      return colors.accent;
    },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  bubble: {
    position: "absolute",
    gap: spacing(2),
    padding: spacing(3),
    borderRadius: radius.card,
    borderWidth: 1,
    get borderColor() {
      return colors.border;
    },
    get backgroundColor() {
      return colors.elevated;
    },
  },
  line: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  dismiss: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
});
