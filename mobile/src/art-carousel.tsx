import { useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { CardImage } from "./ui";
import { colors, spacing } from "./theme";

export interface Art {
  imageUrl: string;
  label: string;
  variants: string[];
}

/**
 * A card's artworks, swiped one at a time: the founder (2026-11-25), "for
 * alt arts, you should be able to swipe between them like a carousel ...
 * for all tcg's", then "an actual carousel - you'll see the card on the
 * right loaded, then you can swipe into the alt arts." The art on show is
 * centred and full size; the next one peeks in at the right, smaller,
 * and grows into the middle as it is swiped to. A tap opens it large. Under
 * it, the art's name and a dot per art. One art, no dots and nothing to
 * swipe. The website's card page has the same carousel.
 *
 * `index` is controlled, so the price chips below can move it, and a
 * swipe reports the page it settled on.
 */
/** The space between two arts on the rail. */
const GAP = 14;

export function ArtCarousel({
  arts,
  name,
  cardNumber,
  pageWidth,
  artWidth,
  index,
  onIndex,
}: {
  arts: Art[];
  name: string;
  cardNumber: string;
  pageWidth: number;
  artWidth: number;
  index: number;
  onIndex: (index: number) => void;
}) {
  const rail = useRef<ScrollView>(null);
  const shown = useRef(index);
  const x = useRef(new Animated.Value(0)).current;
  /* One art and the gap after it: a swipe moves exactly one. */
  const step = artWidth + GAP;
  /* The first art centred; the next one peeks in at the right. */
  const side = (pageWidth - artWidth) / 2;

  /* Moved from outside (a price chip): slide there. */
  useEffect(() => {
    if (index === shown.current) return;
    shown.current = index;
    rail.current?.scrollTo({ x: index * step, animated: true });
  }, [index, step]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / step);
    const next = Math.max(0, Math.min(arts.length - 1, page));
    if (next !== shown.current) {
      shown.current = next;
      onIndex(next);
    }
  };

  const several = arts.length > 1;
  const artHeight = Math.round((artWidth * 88) / 63);
  return (
    <View style={{ alignItems: "center", gap: spacing(2) }}>
      <Animated.ScrollView
        ref={rail}
        horizontal
        scrollEnabled={several}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={{ paddingHorizontal: side, gap: GAP }}
        /* Exactly the art's height: a horizontal rail inside the page's
           scroll otherwise stretched to fill the sheet. */
        style={{ width: pageWidth, height: artHeight, flexGrow: 0 }}
      >
        {arts.map((art, at) => {
          /* The art in the middle full size; its neighbours a little
             smaller and dimmer, growing in as they are swiped to. */
          const range = [(at - 1) * step, at * step, (at + 1) * step];
          const scale = x.interpolate({ inputRange: range, outputRange: [0.88, 1, 0.88], extrapolate: "clamp" });
          const opacity = x.interpolate({ inputRange: range, outputRange: [0.6, 1, 0.6], extrapolate: "clamp" });
          return (
            <Animated.View key={art.imageUrl} style={{ width: artWidth, transform: [{ scale }], opacity }}>
              <CardImage
                imageUrl={art.imageUrl}
                width={artWidth}
                name={name}
                cardNumber={cardNumber}
                caption={art.label}
              />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
      {several ? (
        <View style={{ alignItems: "center", gap: spacing(1.5) }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
            {arts[index]?.label}
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {arts.map((art, at) => (
              <View
                key={art.imageUrl}
                style={{
                  width: at === index ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: at === index ? colors.accent : colors.borderStrong,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
