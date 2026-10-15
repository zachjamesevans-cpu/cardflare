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

import {
  TOUR_DONE,
  TOUR_IDS,
  TOUR_NEXT,
  TOUR_SKIP,
  TOURS,
  tourCount,
  type TourId,
} from "./intro-copy";
import { HoleDim, type DimHole } from "./spotlight";
import { colors, radius, spacing } from "./theme";

/**
 * The first-visit tours: a few stops the first time a new player opens a
 * screen - the Profile, a store room, their own binder, Nearby. The
 * founder: "i think we need another similar vibe, but when people click
 * the profile for the first time", then "build 1-3 go" for the rest.
 * The Feed spotlight's look (spotlight.tsx), one stop at a time, with
 * Next and Skip. The words and the rules are in intro-copy.ts (TOURS).
 *
 * All are queued when the intro ends, so somebody who simply updated the
 * app never sees one; each shows once, on its screen's first visit;
 * Settings -> Help -> "Replay tips" queues them all again.
 */

const pendingKey = (id: TourId) => `cf-tour-${id}`;
/** How far the hole stands off what it points at. */
const PAD = 6;
/** Room the bubble needs below a stop before it goes above instead. */
const BUBBLE_ROOM = 170;

/* --- The stops: whatever each one's view is. ---------------------- */

/* By tour and stop: a binder's "share" is not the profile's. */
const targets = new Map<string, React.RefObject<View | null>>();
const slot = (tour: TourId, key: string) => `${tour}:${key}`;

/** Marks the view a stop points at. */
export function useTourTarget(tour: TourId, key: string): React.RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    const at = slot(tour, key);
    targets.set(at, ref);
    return () => {
      if (targets.get(at) === ref) targets.delete(at);
    };
  }, [tour, key]);
  return ref;
}

/* --- Pending: asked for by the intro, or the replay. ---------------- */

const listeners = new Set<() => void>();

/** Every tour due again, or only the ones named. */
export async function queueTours(ids: readonly TourId[] = TOUR_IDS): Promise<void> {
  for (const id of ids) {
    try {
      await SecureStore.setItemAsync(pendingKey(id), "1");
    } catch {
      /* A nicety: if it cannot be stored, the screen just opens plain. */
    }
  }
  for (const listener of listeners) listener();
}

async function takeTour(id: TourId): Promise<boolean> {
  try {
    if ((await SecureStore.getItemAsync(pendingKey(id))) !== "1") return false;
    await SecureStore.deleteItemAsync(pendingKey(id));
    return true;
  } catch {
    return false;
  }
}

/** The round ones are icons; the others are rows and panels. */
const ROUND: ReadonlySet<string> = new Set([
  "profile:share",
  "profile:wand",
  "binder:share",
  "binder:settings",
]);

/** How far a row's ring stays inside the screen's edges. */
const EDGE = 4;

function measure(at: string, screenWidth: number): Promise<DimHole | null> {
  return new Promise((resolve) => {
    const view = targets.get(at)?.current;
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return resolve(null);
      if (ROUND.has(at)) {
        const size = Math.max(width, height) + PAD * 2;
        return resolve({
          x: x + width / 2 - size / 2,
          y: y + height / 2 - size / 2,
          width: size,
          height: size,
          radius: size / 2,
        });
      }
      /*
       * A row runs edge to edge (the binders, the tab strip), so padding
       * it pushed the ring's sides off the screen - the founder, on the
       * tabs stop: "it's kinda cropped and chopped a bit. make it
       * highlight the edges a bit more accurately." The hole is held
       * inside the screen, so all four sides of the ring show.
       */
      const left = Math.max(EDGE, x - PAD);
      const right = Math.min(screenWidth - EDGE, x + width + PAD);
      resolve({
        x: left,
        y: y - PAD,
        width: right - left,
        height: height + PAD * 2,
        radius: radius.card,
      });
    });
  });
}

/**
 * Drawn by a screen. Waits for its tour to be due, then walks the stops.
 * `when` false holds the tour back - it stays due for a later visit (a
 * binder that already has cards does not need "tap a pocket").
 */
export function Tour({ id, when = true }: { id: TourId; when?: boolean }) {
  const window = useWindowDimensions();
  const stops = TOURS[id];
  const [at, setAt] = useState<number | null>(null);
  const [hole, setHole] = useState<DimHole | null>(null);

  useEffect(() => {
    if (!when) return;
    let live = true;
    const check = () => {
      void takeTour(id).then((due) => {
        /* After the screen has drawn, so the stops are where they stay. */
        if (due && live) setTimeout(() => live && setAt(0), 800);
      });
    };
    check();
    listeners.add(check);
    return () => {
      live = false;
      listeners.delete(check);
    };
  }, [id, when]);

  /* Each stop measured as it comes up; one that is not on the screen is
     passed over rather than pointed at in the wrong place. */
  useEffect(() => {
    if (at === null) return;
    let live = true;
    setHole(null);
    void (async () => {
      /*
       * Up to about four seconds when the stop is on the screen but not
       * drawn yet (still loading); about a second when nothing has
       * claimed it at all - the ZIP ask once a ZIP is saved - so a stop
       * that will never come is not a pause.
       */
      const at_ = slot(id, stops[at].key);
      for (let tries = 0; tries < 16 && live; tries++) {
        if (tries >= 4 && !targets.get(at_)?.current) break;
        const found = await measure(at_, window.width);
        if (found && found.y + found.height <= window.height && found.y >= 0) {
          if (live) setHole(found);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (live) next();
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  const close = () => {
    setAt(null);
    setHole(null);
  };
  const next = () =>
    setAt((current) =>
      current === null || current >= stops.length - 1 ? null : current + 1,
    );

  if (at === null || !hole) return null;

  const stop = stops[at];
  const last = at === stops.length - 1;
  const below = hole.y + hole.height + BUBBLE_ROOM < window.height;

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      {/* A tap anywhere moves on, the way the stop's own Next does. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={next} accessibilityLabel={TOUR_NEXT} />
      <HoleDim width={window.width} height={window.height} hole={hole} />
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: hole.x,
            top: hole.y,
            width: hole.width,
            height: hole.height,
            borderRadius: hole.radius,
          },
        ]}
      />

      <View
        style={[
          styles.bubble,
          {
            left: spacing(4),
            right: spacing(4),
            ...(below
              ? { top: hole.y + hole.height + spacing(3) }
              : { bottom: window.height - hole.y + spacing(3) }),
          },
        ]}
      >
        <Text style={styles.line}>{stop.line}</Text>
        <View style={styles.actions}>
          <Text style={styles.count}>{tourCount(at, stops.length)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}>
            {last ? null : (
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                <Text style={styles.skip}>{TOUR_SKIP}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={next}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.nextButton}
            >
              <Text style={styles.nextLabel}>{last ? TOUR_DONE : TOUR_NEXT}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    gap: spacing(3),
    padding: spacing(3.5),
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  skip: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  nextButton: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    borderRadius: 999,
    get backgroundColor() {
      return colors.accent;
    },
  },
  nextLabel: {
    color: colors.accentContrast,
    fontSize: 14,
    fontWeight: "700",
  },
});

/** The Profile's tour, by its old name. */
export function ProfileTour() {
  return <Tour id="profile" />;
}
