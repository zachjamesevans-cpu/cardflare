import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  runOnJS,
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
 * The home-screen gesture the founder asked for: hold a card, the row
 * wiggles, drag the card to where it goes.
 *
 * HOW IT STAYS SMOOTH. Three rules, each the answer to a glitch that
 * was filmed.
 *
 * 1. The laid-out order never changes while a finger is down. The card
 *    in hand is an OVERLAY drawn over the row, from where it was picked
 *    up, and its old place in the row is kept as an invisible
 *    placeholder of the same size. Neighbours are never re-laid-out
 *    mid-drag; they slide by a transform driven from one spring-animated
 *    number, the slot the card is heading for. Nothing on screen
 *    depends on a React render landing at the right frame.
 *
 * 2. The slot changes with a DEAD ZONE. A card sitting on the line
 *    between two slots used to flip back and forth on every pixel,
 *    re-laying the row out each time: "super tweaked out when a card
 *    goes over itself". Now the card has to travel well past the line
 *    before the slot moves, and well back before it moves again.
 *
 * 3. The drop is one movement. On release the overlay glides to the
 *    exact place its slot will be laid out, and only when it has landed
 *    is the order committed, in one React render that swaps the overlay
 *    for the real tile in the same pixels. There is no unwind and no
 *    frame where two ideas of the order are both on screen.
 *
 * And it roams: the card follows the finger in both directions, out of
 * the row if it likes, because the founder wanted that "just for fun".
 */

const TILE_W = 64;
const TILE_H = 90;
const GAP = spacing(2);
const SLOT = TILE_W + GAP;
/* The row's own vertical padding: the overlay starts level with it. */
const ROW_PAD = 4;
/* How far past the line a card must go before its slot changes, as a
   fraction of a slot. Over a half, so hovering the line cannot flip. */
const DEAD_ZONE = 0.6;

/** Snappy, not rigid: the pick-up, and the neighbours making way. */
const SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;
/** The drop: one glide onto the slot, deterministic so it can be waited for. */
const DROP = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

export interface TrayItem {
  key: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

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
  /** Told once, when the card has landed: the card at `from` now sits at `to`. */
  onReorder: (from: number, to: number) => void;
}) {
  const [wiggling, setWiggling] = useState(false);
  /* The card in the air, and where it was picked up from. */
  const [held, setHeld] = useState<{ key: string; from: number } | null>(null);
  /*
   * Read at the moment of the question rather than captured when the
   * responder was built, so the touch that starts the wiggle can turn
   * into the drag without lifting: "shouldn't have to hold down AND
   * then press again to move them."
   */
  const wigglingRef = useRef(false);
  const heldRef = useRef(false);
  /* The list, readable inside handlers built once per card. */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /* Where the finger has taken the card, from where it grabbed it. */
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  /* The slot the card is heading for, as a spring-smoothed number the
     neighbours slide by. Integer at rest, in between while gliding. */
  const slot = useSharedValue(0);
  /* The slot it was picked up from, for the neighbours' arithmetic. */
  const from = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);

  const startIndex = useRef(0);
  const slotNow = useRef(0);
  /* How far the row is scrolled: the overlay is drawn in the row's
     parent, so it has to subtract this to sit on the picked-up tile. */
  const scrollX = useRef(0);
  const [overlayLeft, setOverlayLeft] = useState(0);

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

  /*
   * The overlay has landed on its slot: commit the order and take the
   * overlay away, in ONE render. The real tile appears exactly where
   * the overlay was, so the swap is invisible.
   */
  const land = (fromIndex: number, toIndex: number) => {
    heldRef.current = false;
    setHeld(null);
    if (fromIndex !== toIndex) onReorder(fromIndex, toIndex);
    /* Nothing reads these once nothing is held; reset for next time. */
    dragX.value = 0;
    dragY.value = 0;
    lift.value = 0;
  };

  const release = () => {
    if (!heldRef.current) return;
    const fromIndex = startIndex.current;
    const toIndex = slotNow.current;
    /* Glide to where the slot will be laid out, then land. The three
       run the same clock, so they finish together. */
    lift.value = withTiming(0, DROP);
    dragY.value = withTiming(0, DROP);
    dragX.value = withTiming((toIndex - fromIndex) * SLOT, DROP, (finished) => {
      if (finished) runOnJS(land)(fromIndex, toIndex);
    });
  };

  const responders = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.key,
          PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            /* Captured, so the move is taken from the Pressable holding
               the touch rather than asked for after it has already
               decided the gesture was a press. */
            onMoveShouldSetPanResponderCapture: (_e, g) =>
              wigglingRef.current &&
              !heldRef.current &&
              (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
            onMoveShouldSetPanResponder: (_e, g) =>
              wigglingRef.current &&
              !heldRef.current &&
              (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
            onPanResponderGrant: () => {
              const at = itemsRef.current.findIndex((entry) => entry.key === item.key);
              if (at < 0) return;
              heldRef.current = true;
              startIndex.current = at;
              slotNow.current = at;
              from.value = at;
              slot.value = at;
              dragX.value = 0;
              dragY.value = 0;
              lift.value = withSpring(1, SPRING);
              setOverlayLeft(at * SLOT - scrollX.current);
              setHeld({ key: item.key, from: at });
            },
            onPanResponderMove: (_e, g) => {
              if (!heldRef.current) return;
              /* Straight to shared values: no render, and the card is
                 under the finger on the very next frame. */
              dragX.value = g.dx;
              dragY.value = g.dy;

              /*
               * The slot the card is over, measured from where it was
               * picked up, with a dead zone around the current slot so
               * a card resting on a line does not flicker between two.
               */
              const over = (startIndex.current * SLOT + g.dx) / SLOT;
              const away = over - slotNow.current;
              if (Math.abs(away) < DEAD_ZONE) return;
              const wanted = clamp(
                slotNow.current + Math.round(away),
                0,
                itemsRef.current.length - 1,
              );
              if (wanted === slotNow.current) return;
              slotNow.current = wanted;
              slot.value = withSpring(wanted, SPRING);
              Haptics.selectionAsync().catch(() => {});
            },
            /*
             * ONCE THE CARD IS IN HAND, NOBODY ELSE GETS THE TOUCH.
             *
             * The row is a horizontal ScrollView and a drag is a
             * horizontal pan, so the ScrollView asks for the gesture
             * back the moment the finger moves sideways - and the
             * default answer to that request is yes. Logging the
             * handlers showed the whole drag living and dying in three
             * lines: grant, one move, terminate. The card never went
             * anywhere because the row took the finger off it.
             */
            onPanResponderTerminationRequest: () => false,
            onShouldBlockNativeResponder: () => true,
            onPanResponderRelease: release,
            onPanResponderTerminate: release,
          }),
        ]),
      ),
    /* Built per card from the list only: a drag never has its handlers
       pulled out from under it, and they read live state from refs. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const heldItem = held ? items.find((item) => item.key === held.key) : undefined;

  return (
    <View style={{ gap: spacing(1.5) }}>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!held}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollX.current = event.nativeEvent.contentOffset.x;
          }}
          /* The card in the air is drawn outside the row, so the row
             itself can keep clipping and scrolling like any other. */
          contentContainerStyle={{ gap: GAP, paddingVertical: ROW_PAD }}
        >
          {items.map((item, index) => (
            <TrayTile
              key={item.key}
              item={item}
              index={index}
              count={items.length}
              placeholder={held?.key === item.key}
              dragging={held !== null}
              active={editing === item.key}
              wiggling={wiggling}
              handlers={responders.get(item.key)?.panHandlers}
              slot={slot}
              from={from}
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

        {/* The card in hand, over the row, following the finger. */}
        {held && heldItem ? (
          <HeldCard
            item={heldItem}
            index={held.from}
            count={items.length}
            left={overlayLeft}
            dragX={dragX}
            dragY={dragY}
            lift={lift}
          />
        ) : null}
      </View>

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

/** What a tile looks like: shared by the row and the card in hand. */
function TileFace({
  item,
  index,
  outlined,
}: {
  item: TrayItem;
  index: number;
  outlined: boolean;
}) {
  return (
    <View
      style={{
        width: TILE_W,
        height: TILE_H,
        borderRadius: 8,
        borderWidth: outlined ? 2 : 1,
        borderColor: outlined ? colors.accent : colors.border,
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
          <Text style={{ color: colors.textPrimary, fontSize: 10, fontWeight: "700" }}>
            {`x${item.quantity}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One tile in the row. Laid out where the list puts it, always; while
 * a card is in the air it slides aside by a transform driven from the
 * slot that card is heading for, and the picked-up card's own tile
 * stays as an invisible placeholder so the row keeps its length.
 */
function TrayTile({
  item,
  index,
  count,
  placeholder,
  dragging,
  active,
  wiggling,
  handlers,
  slot,
  from,
  wobble,
  onPress,
  onLongPress,
}: {
  item: TrayItem;
  index: number;
  count: number;
  placeholder: boolean;
  dragging: boolean;
  active: boolean;
  wiggling: boolean;
  handlers: GestureResponderHandlers | undefined;
  slot: SharedValue<number>;
  from: SharedValue<number>;
  wobble: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    /*
     * Making way. A tile after the pick-up point slides one slot left
     * once the card is heading for its slot or beyond; a tile before it
     * slides one slot right. `slot` is a spring, so the slide is a glide
     * and the tile is exactly where its new slot will be when it stops.
     */
    let shift = 0;
    if (dragging && !placeholder) {
      const origin = from.value;
      const heading = slot.value;
      if (index > origin) {
        shift = -SLOT * Math.max(0, Math.min(1, heading - index + 1));
      } else if (index < origin) {
        shift = SLOT * Math.max(0, Math.min(1, index + 1 - heading));
      }
    }
    return {
      opacity: placeholder ? 0 : 1,
      transform: [
        { translateX: shift },
        { rotate: `${interpolate(wobble.value, [-1, 1], [-2.5, 2.5])}deg` },
      ],
    };
  });

  return (
    <Animated.View
      {...(handlers ?? {})}
      style={[{ width: TILE_W, height: TILE_H }, style]}
    >
      <Tap
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={`${item.name}, ${
          index === 0 ? "cover" : `card ${index + 1} of ${count}`
        }${wiggling ? ", drag to reorder" : ", hold to reorder"}`}
      >
        <TileFace item={item} index={index} outlined={active} />
      </Tap>
    </Animated.View>
  );
}

/**
 * The card in hand: drawn over the row from the picked-up tile's place,
 * moved only by the finger, lifted a little. It never re-lays out, so it
 * never jumps; on release it glides onto its slot and the row takes over.
 */
function HeldCard({
  item,
  index,
  count,
  left,
  dragX,
  dragY,
  lift,
}: {
  item: TrayItem;
  index: number;
  count: number;
  left: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  lift: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + 0.12 * lift.value },
    ],
    shadowOpacity: 0.5 * lift.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`${item.name}, card ${index + 1} of ${count}, in hand`}
      style={[
        {
          position: "absolute",
          left,
          top: ROW_PAD,
          width: TILE_W,
          height: TILE_H,
          zIndex: 10,
          elevation: 10,
          shadowColor: colors.canvas,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <TileFace item={item} index={index} outlined />
    </Animated.View>
  );
}
