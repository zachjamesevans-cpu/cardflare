import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * The Feed's tabs as pages you swipe between, left and right.
 *
 * The founder: "should be able to swipe cleanly between following,
 * nearby... like swipe left and right." The same mechanism as the
 * Profile's strip (profile-tabs.tsx): a horizontal pager inside the
 * screen's vertical scroll, each page as wide as the screen, the track
 * as tall as the page in front so the one behind cannot leave a blank
 * stretch under it. The tab buttons above stay the screen's own and
 * drive this through `active`; a swipe reports back through `onChange`.
 *
 * A card strip inside a post scrolls on its own: a drag that starts on
 * it moves the cards, a drag anywhere else turns the page.
 */

const SLIDE_MS = 220;

export function FeedPager<Key extends string>({
  tabs,
  active,
  onChange,
  render,
  gutter,
}: {
  tabs: readonly Key[];
  active: Key;
  onChange: (tab: Key) => void;
  render: (tab: Key) => ReactNode;
  /** The screen's side padding: the pager runs edge to edge past it. */
  gutter: number;
}) {
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const index = Math.max(0, tabs.indexOf(active));

  const pager = useRef<Animated.ScrollView>(null);
  const settled = useSharedValue(index);
  /* A tap is scrolling the pager: ignore the pages it passes. */
  const driving = useSharedValue(false);
  const target = useSharedValue(0);
  const height = useSharedValue(0);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const land = useCallback((at: number) => {
    const tab = tabsRef.current[at];
    if (tab) onChangeRef.current(tab);
  }, []);

  /* A tab button pressed above: slide to its page. */
  useEffect(() => {
    if (width <= 0 || settled.value === index) return;
    driving.value = true;
    target.value = index * width;
    settled.value = index;
    pager.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width, driving, settled, target]);

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const x = event.contentOffset.x;
        if (driving.value) {
          if (Math.abs(x - target.value) < 1) driving.value = false;
          return;
        }
        if (width <= 0) return;
        const at = Math.min(tabs.length - 1, Math.max(0, Math.round(x / width)));
        if (at !== settled.value) {
          settled.value = at;
          runOnJS(land)(at);
        }
      },
    },
    [width, tabs.length, land],
  );

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    driving.value = false;
    if (width <= 0) return;
    const at = Math.min(
      tabs.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)),
    );
    settled.value = at;
    if (at !== index) land(at);
  };

  useEffect(() => {
    const next = heights[index];
    if (!next) return;
    height.value = height.value === 0 ? next : withTiming(next, { duration: SLIDE_MS });
  }, [heights, index, height]);

  const track = useAnimatedStyle(() =>
    height.value > 0 ? { height: height.value } : {},
  );

  return (
    <View
      style={{ marginHorizontal: -gutter }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {width > 0 ? (
        <Animated.View style={[{ overflow: "hidden" }, track]}>
          <Animated.ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={onMomentumScrollEnd}
            contentOffset={{ x: index * width, y: 0 }}
            style={{ width }}
            contentContainerStyle={{ alignItems: "flex-start" }}
          >
            {tabs.map((tab, at) => (
              <View
                key={tab}
                style={{ width, paddingHorizontal: gutter }}
                accessibilityElementsHidden={at !== index}
                importantForAccessibility={at !== index ? "no-hide-descendants" : "auto"}
                onLayout={(event) => {
                  const measured = Math.ceil(event.nativeEvent.layout.height);
                  setHeights((current) =>
                    current[at] === measured ? current : { ...current, [at]: measured },
                  );
                }}
              >
                {render(tab)}
              </View>
            ))}
          </Animated.ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
