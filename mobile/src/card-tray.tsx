import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * The cards in a Flare, in order, PICKED UP and dragged into place.
 *
 * The founder: "instead of having the 'move left' and 'move right'
 * controls, delete those in the flare menu and have a drag and drop
 * option to reorder. like you can hold a card, itll wiggle, and you can
 * reorder it by dragging it." Then, on the first cut: "looks kinda
 * choppy. focus on making the animation much smoother, and when you
 * drag a card, it like 'picks up' the card and follows your finger."
 *
 * EVERY FRAME RUNS ON THE UI THREAD, which is what the second note was
 * really about. The first version kept the hovered slot in React state
 * and set it from the pan handler, so every few pixels of finger
 * movement re-rendered the whole row - twelve tiles reconciled per
 * gesture, on the JavaScript thread, while that same thread was being
 * asked to follow a finger. It stuttered exactly as much as you would
 * expect.
 *
 * Now nothing about the drag reaches React. The finger writes to shared
 * values, each tile reads them in its own worklet, and the only two
 * renders in a whole gesture are the ones that turn the held state on
 * and off. `withSpring` does the settling, so a tile that steps aside
 * glides rather than jumping a slot.
 *
 * THE PICK-UP IS THE POINT. On grant the held tile springs up - bigger,
 * tilted back to level, a shadow under it - so it reads as lifted off
 * the row rather than sliding along it. On release it springs back down
 * into its new slot. Reanimated 4 is already in the app and already
 * driving the collapsing header, so this costs no new dependency.
 */

const TILE_W = 64;
const TILE_H = 90;
const GAP = spacing(2);
const SLOT = TILE_W + GAP;

/** How hard the springs are. Snappy, but not rigid. */
const SPRING = { damping: 20, stiffness: 260, mass: 0.6 } as const;

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
  /** Commit a move: the card at `from` now sits at `to`. */
  onReorder: (from: number, to: number) => void;
}) {
  /*
   * Wiggling is the MODE, not the gesture. A long press turns it on for
   * the whole row - the way a home screen does - and after that a plain
   * drag moves any tile. Dragging straight out of a long press would
   * mean only the tile you happened to hold could be moved.
   */
  const [wiggling, setWiggling] = useState(false);
  /*
   * THE SAME FINGER HAS TO CARRY ON INTO THE DRAG.
   *
   * The founder: "shouldn't have to hold down AND then press again to
   * move them. when holding down, it should let you rearrange right
   * after the wiggle."
   *
   * A pan responder captures its handlers when it is built. Turning
   * the wiggle on re-rendered the row and built new ones - but the
   * touch already in progress stayed bound to the OLD handlers, which
   * had closed over `wiggling: false` and so refused every move. The
   * mode was on, the finger was down, and nothing happened until it
   * lifted and pressed again.
   *
   * A ref is read at the moment of the question rather than captured
   * when the responder was made, so the touch that started the wiggle
   * is the touch that does the dragging.
   */
  const wigglingRef = useRef(false);
  /* Which tile is in the air. The ONLY state the gesture touches, and
     it changes twice: once on pick up, once on release. */
  const [heldKey, setHeldKey] = useState<string | null>(null);

  /* Everything the tiles need to draw a frame, read on the UI thread. */
  const dragX = useSharedValue(0);
  const fromSlot = useSharedValue(-1);
  const toSlot = useSharedValue(-1);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);
  /*
   * ONE MOVEMENT PER DROP, not two.
   *
   * The founder: "theres this like secondary animation that's happening
   * after the card gets locked into place after I move it."
   *
   * Committing the reorder re-renders every tile into its new layout
   * position - that IS the movement, and it is instant. The transforms
   * that opened the gap were still unwinding from a slot's width back
   * to zero through a spring, so each tile travelled twice: once
   * because the row relaid out, once more as its own offset caught up.
   *
   * Springs while a finger is down, because a gap opening is worth
   * animating. Nothing at all on release, because by then the layout
   * has already said everything.
   */
  const settling = useSharedValue(0);

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
    wobble.value = withTiming(0, { duration: 120 });
  };

  /*
   * The new order is on screen; the offsets that were standing in for
   * it are now the layout's job.
   *
   * `useLayoutEffect`, not `useEffect`: this has to run before the
   * frame is painted. A tile's shift is worked out from slot numbers
   * that the reorder has just invalidated, so leaving them set for even
   * one painted frame draws the row wrong.
   */
  useLayoutEffect(() => {
    if (settling.value === 0) return;
    dragX.value = 0;
    fromSlot.value = -1;
    toSlot.value = -1;
    settling.value = 0;
  }, [items, dragX, fromSlot, toSlot, settling]);

  /*
   * One responder per tile, rebuilt only when the row's length or the
   * mode changes - never during a drag, because nothing re-renders
   * during a drag.
   */
  const responders = useMemo(
    () =>
      items.map((item, index) =>
        PanResponder.create({
          /* A still finger is a tap, and a tap edits. Only travel
             counts as a drag. */
          onStartShouldSetPanResponder: () => false,
          /* Capture, so the move is taken from the Pressable that is
             holding the touch rather than asked for politely after it
             has already decided the gesture is a press. */
          onMoveShouldSetPanResponderCapture: (_e, g) =>
            wigglingRef.current && Math.abs(g.dx) > 4,
          onMoveShouldSetPanResponder: (_e, g) =>
            wigglingRef.current && Math.abs(g.dx) > 4,
          onPanResponderGrant: () => {
            fromSlot.value = index;
            toSlot.value = index;
            dragX.value = 0;
            /* The pick-up: up and out of the row, in one spring. */
            lift.value = withSpring(1, SPRING);
            setHeldKey(item.key);
          },
          onPanResponderMove: (_e, g) => {
            /* Straight to the shared value: no setState, no render.
               The tile's worklet has the new number next frame. */
            dragX.value = g.dx;
            const slid = Math.round((index * SLOT + g.dx) / SLOT);
            const next = Math.max(0, Math.min(items.length - 1, slid));
            if (next !== toSlot.value) toSlot.value = next;
          },
          onPanResponderRelease: () => {
            const to = toSlot.value;
            setHeldKey(null);

            if (to === index) {
              /* Went nowhere: spring home, nothing to commit. */
              dragX.value = withSpring(0, SPRING);
              lift.value = withSpring(0, SPRING);
              fromSlot.value = -1;
              toSlot.value = -1;
              return;
            }

            /*
             * LEAVE EVERY TILE WHERE THE REORDER IS ABOUT TO PUT IT.
             *
             * The founder: "still a 'flash' that happens when I place a
             * card." That was a one-frame race. Zeroing the offset at
             * release put the held card back in its OLD slot, because
             * React had not re-rendered the new order yet - so it
             * snapped home for a frame and then reappeared where it was
             * dropped. The neighbours did the same when their step-aside
             * was cleared.
             *
             * So nothing is cleared here. The held card is parked at
             * exactly the offset that puts it in its destination slot,
             * and the neighbours keep the shift that already has them
             * standing where they will end up. Every tile is now drawn
             * precisely where the relayout is about to place it, which
             * makes the swap itself invisible - whichever order the two
             * threads land in.
             */
            settling.value = 1;
            dragX.value = (to - index) * SLOT;
            lift.value = 0;
            onReorder(index, to);
          },
          onPanResponderTerminate: () => {
            /* Nothing was committed, so there is no relayout to hide
               behind: this one springs home the way it came. */
            dragX.value = withSpring(0, SPRING);
            lift.value = withSpring(0, SPRING);
            setHeldKey(null);
            fromSlot.value = -1;
            toSlot.value = -1;
          },
        }),
      ),
    /* No `wiggling` here on purpose: rebuilding mid-touch is what
       broke the hold-then-drag. The ref carries the mode instead. */
    [items, dragX, fromSlot, toSlot, lift, settling, onReorder],
  );

  return (
    <View style={{ gap: spacing(1.5) }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        /* A drag and a scroll are the same finger; the row holds still
           while a card is in the air. */
        scrollEnabled={!heldKey}
        contentContainerStyle={{ gap: GAP, paddingVertical: 4 }}
      >
        {items.map((item, index) => (
          <TrayTile
            key={item.key}
            item={item}
            index={index}
            held={heldKey === item.key}
            active={editing === item.key}
            wiggling={wiggling}
            count={items.length}
            handlers={responders[index]?.panHandlers}
            dragX={dragX}
            fromSlot={fromSlot}
            toSlot={toSlot}
            lift={lift}
            settling={settling}
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

      {/*
       * The way out, said plainly. A mode you cannot see the edge of is
       * a mode people get stuck in, and "tap a card" is not guessable.
       */}
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
 * One tile, drawing itself from shared values.
 *
 * Its own component because `useAnimatedStyle` is a hook and a `.map()`
 * cannot hold one. That is the good kind of forced hand: each tile now
 * re-evaluates only its own worklet when the finger moves, on the UI
 * thread, and the list above it never renders at all.
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
  fromSlot,
  toSlot,
  lift,
  settling,
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
  fromSlot: SharedValue<number>;
  toSlot: SharedValue<number>;
  lift: SharedValue<number>;
  /** 1 while a drop is being committed: snap, do not animate. */
  settling: SharedValue<number>;
  wobble: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const mine = fromSlot.value === index;

    if (mine) {
      /* In the air: it follows the finger and holds still while the
         rest of the row wobbles around it. */
      return {
        transform: [
          { translateX: dragX.value },
          { scale: 1 + 0.12 * lift.value },
          { rotate: "0deg" },
        ],
        shadowOpacity: 0.5 * lift.value,
        shadowRadius: 4 + 8 * lift.value,
        zIndex: 10,
      };
    }

    /*
     * Everything between the held tile's slot and the slot it hovers
     * steps one place the other way. The same arithmetic the reorder
     * does, drawn a frame early so the gap opens before the drop.
     */
    let shift = 0;
    const a = fromSlot.value;
    const b = toSlot.value;
    if (a >= 0 && b >= 0) {
      if (a < b && index > a && index <= b) shift = -SLOT;
      else if (a > b && index >= b && index < a) shift = SLOT;
    }

    return {
      transform: [
        {
          translateX:
            settling.value === 1 ? shift : withSpring(shift, SPRING),
        },
        { scale: 1 },
        {
          rotate: `${interpolate(wobble.value, [-1, 1], [-2.5, 2.5])}deg`,
        },
      ],
      shadowOpacity: 0,
      shadowRadius: 0,
      zIndex: 1,
    };
  });

  return (
    <Animated.View
      {...(handlers ?? {})}
      style={[
        {
          width: TILE_W,
          height: TILE_H,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 5 },
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
