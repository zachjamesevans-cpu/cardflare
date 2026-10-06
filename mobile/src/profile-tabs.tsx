import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, spacing } from "./theme";

/**
 * The strip of icon tabs under a profile's highlights, and the panes
 * that slide under it: the app's half of
 * src/components/players/profile-tabs.tsx, same tabs, same order,
 * same default.
 *
 * The founder, with a recording of Instagram's profile: "The goal is
 * to just have a sliding animation between them that's click and
 * doesn't go into a full screen animation / loading screen so you can
 * still access these buttons." So nothing here navigates and nothing
 * loads: the header and the highlight circles stay put, the strip
 * stays on screen, and the section under it is one page of a
 * horizontal pager that slides sideways when a tab is tapped or the
 * pane is swiped. Every pane's data is already on the profile.
 *
 * Icon only, like Instagram's strip: the label exists for screen
 * readers and nobody else. The underline is one bar that follows the
 * pager's scroll offset live, so a swipe drags it and a tap slides
 * it; the active icon is the bright one.
 *
 * The pager sits inside the profile's vertical scroll. The two own
 * different axes, so a vertical drag over a pane still scrolls the
 * page and a horizontal one turns it.
 */

export type ProfileTab =
  "flares" | "hunts" | "binders" | "showcase" | "trades" | "embers";

export const TABS: Record<
  ProfileTab,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  /* Flares wear the flame, the dock's Flare glyph, and Embers the
     shop, since the tab is the store: the website's profile-tabs.tsx
     draws the same pair. */
  flares: { label: "Flares", icon: "flame-outline" },
  hunts: { label: "Hunts", icon: "locate-outline" },
  binders: { label: "Binders", icon: "book-outline" },
  showcase: { label: "Showcase", icon: "sparkles-outline" },
  trades: { label: "Trades", icon: "swap-horizontal-outline" },
  embers: { label: "Embers", icon: "storefront-outline" },
};

/** Your own profile: all six. Trades and Embers are nobody else's. */
export const OWN_TABS: ProfileTab[] = [
  "flares",
  "hunts",
  "binders",
  "showcase",
  "trades",
  "embers",
];
/** Somebody else's: the four anybody may see. */
export const THEIR_TABS: ProfileTab[] = ["flares", "hunts", "binders", "showcase"];

/** The first tab, on both profiles. */
export const DEFAULT_TAB: ProfileTab = "flares";

export interface ProfilePane {
  key: ProfileTab;
  content: ReactNode;
}

/**
 * How far the profile's words sit from the screen's edge. The block
 * runs edge to edge now (the founder: "I'd like the profile to extend
 * all the way over to the edges of the screen"), so the inset that the
 * card's padding used to give lives here, on the rows that hold text.
 */
export const PROFILE_INSET = spacing(4);

/**
 * The panes that run to the screen's edges with no inset: a grid of
 * cards, the way Instagram's grid meets the sides. Its own count line
 * keeps the inset. Every other pane holds rows of words and sits in.
 */
export const EDGE_TO_EDGE: readonly ProfileTab[] = ["flares"];

/** The strip's height, and the icon in it. */
const STRIP_HEIGHT = 44;
const ICON = 20;
/** How long the underline and the pane's height take to settle. */
const SLIDE_MS = 200;

export function ProfileTabs({
  panes,
  onChange,
}: {
  panes: ProfilePane[];
  /** A different tab is in front: the owner may fetch for it. */
  onChange?: (tab: ProfileTab) => void;
}) {
  const count = panes.length;
  /* The screen's width, edge to edge: one page of the pager, measured. */
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      panes.findIndex((pane) => pane.key === DEFAULT_TAB),
    ),
  );
  /* Each pane's own height, so the track can be exactly as tall as
     the one in front and no taller. */
  const [heights, setHeights] = useState<Record<number, number>>({});

  const pager = useRef<Animated.ScrollView>(null);
  /* The pager's scroll offset, which the underline divides by the
     number of tabs. Written by every scroll frame, and by a tap. */
  const offset = useSharedValue(0);
  /* Which page the scroll last settled on, so a swipe past the
     midpoint changes the tab once rather than every frame. */
  const settled = useSharedValue(active);
  /* A tap is scrolling the pager: ignore the pages it passes. */
  const driving = useSharedValue(false);
  const target = useSharedValue(0);
  /* The track's height, animated to the active pane's. */
  const height = useSharedValue(0);

  /* Read through refs from the scroll worklet's callback, so the
     handler never holds a stale list or a stale listener. */
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const land = useCallback((index: number) => {
    setActive(index);
    const pane = panesRef.current[index];
    if (pane) onChangeRef.current?.(pane.key);
  }, []);

  const go = (index: number) => {
    if (index === active && !driving.value) return;
    driving.value = true;
    target.value = index * width;
    settled.value = index;
    land(index);
    /* The underline slides on its own clock; the scroll frames that
       follow write the same places over it. */
    offset.value = withTiming(index * width, { duration: SLIDE_MS });
    pager.current?.scrollTo({ x: index * width, animated: true });
  };

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const x = event.contentOffset.x;
        offset.value = x;
        if (driving.value) {
          if (Math.abs(x - target.value) < 1) driving.value = false;
          return;
        }
        if (width <= 0) return;
        const index = Math.min(count - 1, Math.max(0, Math.round(x / width)));
        if (index !== settled.value) {
          settled.value = index;
          runOnJS(land)(index);
        }
      },
    },
    [width, count, land],
  );

  /* The settled truth, after a swipe's momentum or a tap's scroll. */
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    driving.value = false;
    if (width <= 0) return;
    const index = Math.min(
      count - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
    );
    settled.value = index;
    offset.value = index * width;
    if (index !== active) land(index);
  };

  useEffect(() => {
    const next = heights[active];
    if (!next) return;
    /* The first measurement lands without a slide; after that the
       track grows or shrinks to the pane in front. */
    height.value = height.value === 0 ? next : withTiming(next, { duration: SLIDE_MS });
  }, [heights, active, height]);

  const underline = useAnimatedStyle(() => ({
    transform: [{ translateX: count > 0 ? offset.value / count : 0 }],
  }));
  const track = useAnimatedStyle(() =>
    height.value > 0 ? { height: height.value } : {},
  );

  return (
    <View
      style={{ gap: 0 }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {/* The strip: evenly spaced icon tabs, a hairline under the row,
          and the one underline that slides to the tab in front. */}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          height: STRIP_HEIGHT,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {panes.map((pane, index) => {
          const selected = index === active;
          return (
            <Pressable
              key={pane.key}
              onPress={() => go(index)}
              accessibilityRole="tab"
              accessibilityLabel={TABS[pane.key].label}
              accessibilityState={{ selected }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons
                name={TABS[pane.key].icon}
                size={ICON}
                color={selected ? colors.textPrimary : colors.textMuted}
              />
            </Pressable>
          );
        })}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                bottom: 0,
                width: width / count,
                height: 2,
                backgroundColor: colors.accent,
              },
              underline,
            ]}
          />
        ) : null}
      </View>

      {/* The track: one page per pane, side by side, as tall as the
          pane in front. Swiping turns the page; a tab tap scrolls to
          it. */}
      {width > 0 ? (
        <Animated.View style={[{ overflow: "hidden" }, track]}>
          <Animated.ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={{ width }}
            contentContainerStyle={{ alignItems: "flex-start" }}
          >
            {panes.map((pane, index) => (
              <View
                key={pane.key}
                style={{
                  width,
                  paddingHorizontal: EDGE_TO_EDGE.includes(pane.key)
                    ? 0
                    : PROFILE_INSET,
                }}
                accessibilityElementsHidden={index !== active}
                importantForAccessibility={
                  index !== active ? "no-hide-descendants" : "auto"
                }
                onLayout={(event) => {
                  const measured = Math.ceil(event.nativeEvent.layout.height);
                  setHeights((current) =>
                    current[index] === measured
                      ? current
                      : { ...current, [index]: measured },
                  );
                }}
              >
                {pane.content}
              </View>
            ))}
          </Animated.ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
