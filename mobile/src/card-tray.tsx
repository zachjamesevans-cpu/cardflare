import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  ScrollView,
  Text,
  View,
  type GestureResponderHandlers,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { RemoteImage } from "./remote-image";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The cards in a Flare, in order, picked up and dragged into place.
 *
 * The founder asked for the home-screen gesture - "you can hold a card,
 * itll wiggle, and you can reorder it by dragging it" - and then, over
 * three rounds of looking at it: "theres this like secondary animation
 * that's happening after the card gets locked into place", "still a
 * 'flash' that happens when I place a card", "its jsut a litte glitchy".
 *
 * ALL THREE WERE ONE BUG, and my first two attempts at it were wrong in
 * the same way. The row used to stay laid out in the OLD order for the
 * whole drag, with neighbours pushed aside by transforms, and the real
 * reorder committed on release. That left two things to reconcile at
 * the drop: a React re-render moving every tile to its new laid-out
 * place, and a pile of UI-thread transforms that had to unwind to zero.
 *
 * THEY CANNOT BE SEQUENCED. A shared value written from JavaScript does
 * not reach the UI thread synchronously, so there is always a window
 * where the new order is laid out while the old slot numbers are still
 * driving the transforms - and in that window the row draws nonsense.
 * Recording a drop at 60fps and stepping through it showed exactly
 * that: three tiles overlapping and a fourth stranded, for ~350ms.
 *
 * So there is no pending reorder any more. THE ORDER CHANGES WHILE THE
 * FINGER IS STILL DOWN, the moment a card crosses into a new slot.
 * Neighbours are never transformed at all - they are laid out somewhere
 * new and `LinearTransition` glides them there on the UI thread. The
 * held card's offset is measured from where it is laid out RIGHT NOW,
 * so when the order changes underneath it, it stays under the finger.
 * On release the offset goes to zero and the card is already in the
 * right place: nothing to unwind, nothing to race.
 *
 * AND IT ROAMS. The founder: "you should be able to move the cards
 * outside of the frame, just for fun. like, that whole screen, you
 * should be able to drag the cards." So the held card follows in both
 * directions and the row stops clipping while one is in the air.
 */

const TILE_W = 64;
const TILE_H = 90;
const GAP = spacing(2);
const SLOT = TILE_W + GAP;

/** Snappy, not rigid. The pick-up, and the card settling back down. */
const SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;
/** How the neighbours glide when the order changes under the finger. */
const SHUFFLE = LinearTransition.springify().damping(22).stiffness(260).mass(0.6);

export interface TrayItem {
  key: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
}

export function CardTray({
  items,
  editing,
  onEdit,
  onAdd,
  onReorder,
}: {
  items: TrayItem[];
  editing: string | null;
  onEdit: (key: string) => void;
  onAdd: () => void;
  /** Told once, on release: the card at `from` now sits at `to`. */
  onReorder: (from: number, to: number) => void;
}) {
  /*
   * The row as it is drawn. Its own state, because the order changes
   * several times during one drag and the composer only needs to hear
   * the result - a draft write per slot crossed would be a lot of work
   * for something nobody has finished saying yet.
   */
  const [order, setOrder] = useState<TrayItem[]>(items);
  const dragging = useRef(false);

  /* Between gestures the composer is the source of truth. */
  useEffect(() => {
    if (!dragging.current) setOrder(items);
  }, [items]);

  const [wiggling, setWiggling] = useState(false);
  const [heldKey, setHeldKey] = useState<string | null>(null);
  /*
   * Read at the moment of the question rather than captured when the
   * responder was built - otherwise the touch that starts the wiggle is
   * bound to handlers that still think the row is still, and you have
   * to lift and press again. The founder: "shouldn't have to hold down
   * AND then press again to move them."
   */
  const wigglingRef = useRef(false);

  /* Where the finger is, relative to where it grabbed. */
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  /* The slot the held card currently occupies in the live order. */
  const grabSlot = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);

  /* Where this drag started, and where it has got to. */
  const startIndex = useRef(0);
  const slotNow = useRef(0);

  const startWiggle = () => {
    wigglingRef.current = true;
    setWiggling(true);
    wobble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 110, easing: Easing.linear }),
        withTiming(-1, { duration: 220, easing: Easing.linear }),
        withTiming(0, { duration: 110, easing: Easing.linear }),
      ),
      -1,
    );
  };

  const stopWiggle = () => {
    wigglingRef.current = false;
    setWiggling(false);
    cancelAnimation(wobble);
    wobble.value = withTiming(0, { duration: 140 });
  };

  const responders = useMemo(
    () =>
      order.map((item) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          /* Captured, so the move is taken from the Pressable holding
             the touch rather than asked for after it has already
             decided the gesture was a press. */
          onMoveShouldSetPanResponderCapture: (_e, g) =>
            wigglingRef.current && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
          onMoveShouldSetPanResponder: (_e, g) =>
            wigglingRef.current && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
          onPanResponderGrant: () => {
            const at = order.findIndex((entry) => entry.key === item.key);
            if (at < 0) return;
            dragging.current = true;
            startIndex.current = at;
            slotNow.current = at;
            grabSlot.value = at;
            dragX.value = 0;
            dragY.value = 0;
            lift.value = withSpring(1, SPRING);
            setHeldKey(item.key);
          },
          onPanResponderMove: (_e, g) => {
            /* Straight to shared values: no setState, no render, and
               the card is under the finger on the very next frame. */
            dragX.value = g.dx;
            dragY.value = g.dy;

            /*
             * Crossed into a new slot? Measured from where the drag
             * began, so it is stable however many times the order has
             * already changed underneath it.
             */
            const wanted = Math.max(
              0,
              Math.min(
                order.length - 1,
                Math.round((startIndex.current * SLOT + g.dx) / SLOT),
              ),
            );
            if (wanted === slotNow.current) return;

            /* Reorder NOW, with the finger still down. The neighbours
               relayout and glide; nothing is left pending for later. */
            const at = slotNow.current;
            slotNow.current = wanted;
            grabSlot.value = wanted;
            setOrder((current) => {
              const next = [...current];
              const [moved] = next.splice(at, 1);
              if (moved) next.splice(wanted, 0, moved);
              return next;
            });
          },
          onPanResponderRelease: () => {
            /*
             * The card is already in its final slot - the order moved
             * as the finger did - so the offset simply goes to zero.
             * No re-render to wait for and nothing to unwind, which is
             * the whole reason the drop is clean now.
             */
            dragX.value = withSpring(0, SPRING);
            dragY.value = withSpring(0, SPRING);
            lift.value = withSpring(0, SPRING);
            setHeldKey(null);
            dragging.current = false;
            const from = startIndex.current;
            const to = slotNow.current;
            if (from !== to) onReorder(from, to);
          },
          onPanResponderTerminate: () => {
            dragX.value = withSpring(0, SPRING);
            dragY.value = withSpring(0, SPRING);
            lift.value = withSpring(0, SPRING);
            setHeldKey(null);
            dragging.current = false;
            const from = startIndex.current;
            const to = slotNow.current;
            if (from !== to) onReorder(from, to);
          },
        }),
      ),
    [order, dragX, dragY, grabSlot, lift, onReorder],
  );

  return (
    <View style={{ gap: spacing(1.5) }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!heldKey}
        /* The held card is allowed out of the row. Clipping comes back
           the moment it is put down, so a long row still scrolls. */
        removeClippedSubviews={false}
        style={heldKey ? { overflow: "visible" } : undefined}
        contentContainerStyle={{ gap: GAP, paddingVertical: 4 }}
      >
        {order.map((item, index) => (
          <TrayTile
            key={item.key}
            item={item}
            index={index}
            held={heldKey === item.key}
            active={editing === item.key}
            wiggling={wiggling}
            count={order.length}
            handlers={responders[index]?.panHandlers}
            dragX={dragX}
            dragY={dragY}
            grabSlot={grabSlot}
            lift={lift}
            wobble={wobble}
            onPress={() => (wiggling ? stopWiggle() : onEdit(item.key))}
            onLongPress={startWiggle}
          />
        ))}

        {/* Hidden while rearranging: an "add" target under a dragging
            finger is somewhere to drop a card by accident. */}
        {wiggling ? null : (
          <Tap
            onPress={onAdd}
            accessibilityLabel="Add cards"
            style={{
              width: TILE_W,
              height: TILE_H,
              borderRadius: 8,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.borderStrong,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <Ionicons name="add" size={22} color={colors.accent} />
            <Text
              style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600" }}
            >
              Add cards
            </Text>
          </Tap>
        )}
      </ScrollView>

      {/* A mode you cannot see the edge of is a mode people get stuck
          in, and "tap a card" is not guessable. */}
      {wiggling ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
            Drag a card to reorder. The first is the cover.
          </Text>
          <Tap
            onPress={stopWiggle}
            accessibilityLabel="Done reordering"
            style={{
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(1),
              borderRadius: 999,
              backgroundColor: colors.accent,
            }}
          >
            <Text
              style={{ color: colors.accentContrast, fontSize: 12, fontWeight: "700" }}
            >
              Done
            </Text>
          </Tap>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One tile.
 *
 * Its own component because `useAnimatedStyle` is a hook and a `.map()`
 * cannot hold one - the good kind of forced hand, since each tile now
 * re-evaluates only its own worklet.
 *
 * A tile that is NOT held carries no drag transform at all. It is laid
 * out where the live order puts it and `layout` glides it there. That
 * is the whole trick: nothing to unwind on release.
 */
function TrayTile({
  item,
  index,
  held,
  active,
  wiggling,
  count,
  handlers,
  dragX,
  dragY,
  grabSlot,
  lift,
  wobble,
  onPress,
  onLongPress,
}: {
  item: TrayItem;
  index: number;
  held: boolean;
  active: boolean;
  wiggling: boolean;
  count: number;
  handlers: GestureResponderHandlers | undefined;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  grabSlot: SharedValue<number>;
  lift: SharedValue<number>;
  wobble: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    if (!held) {
      return {
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: 1 },
          { rotate: `${interpolate(wobble.value, [-1, 1], [-2.5, 2.5])}deg` },
        ],
        shadowOpacity: 0,
        zIndex: 1,
      };
    }

    /*
     * Measured from where this tile is laid out RIGHT NOW. When the
     * order changes under the finger its slot changes with it, and
     * taking the difference here is what keeps the card pinned to the
     * finger through the shuffle rather than hopping a slot.
     */
    const slid = grabSlot.value * SLOT + dragX.value - index * SLOT;
    return {
      transform: [
        { translateX: slid },
        { translateY: dragY.value },
        { scale: 1 + 0.12 * lift.value },
        { rotate: "0deg" },
      ],
      shadowOpacity: 0.5 * lift.value,
      zIndex: 10,
    };
  });

  return (
    <Animated.View
      {...(handlers ?? {})}
      /* No layout animation on the card in hand: it is following a
         finger, and a transition would fight the transform. */
      layout={held ? undefined : SHUFFLE}
      style={[
        {
          width: TILE_W,
          height: TILE_H,
          shadowColor: "#000",
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <Tap
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={`${item.name}, ${
          index === 0 ? "cover" : `card ${index + 1} of ${count}`
        }${wiggling ? ", drag to reorder" : ", hold to reorder"}`}
        style={{
          width: TILE_W,
          height: TILE_H,
          borderRadius: 8,
          borderWidth: active || held ? 2 : 1,
          borderColor: active || held ? colors.accent : colors.border,
          backgroundColor: colors.elevated,
          overflow: "hidden",
        }}
      >
        <RemoteImage uri={item.imageUrl} style={{ width: "100%", height: "100%" }} />
        <View
          style={{
            position: "absolute",
            top: 3,
            left: 3,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: index === 0 ? colors.accent : colors.canvas,
          }}
        >
          <Text
            style={{
              color: index === 0 ? colors.accentContrast : colors.textPrimary,
              fontSize: 10,
              fontWeight: "700",
            }}
          >
            {index + 1}
          </Text>
        </View>
        {item.quantity > 1 ? (
          <View
            style={{
              position: "absolute",
              bottom: 3,
              right: 3,
              borderRadius: 999,
              paddingHorizontal: 5,
              paddingVertical: 1,
              backgroundColor: colors.canvas,
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: 10, fontWeight: "700" }}
            >
              {`x${item.quantity}`}
            </Text>
          </View>
        ) : null}
      </Tap>
    </Animated.View>
  );
}
