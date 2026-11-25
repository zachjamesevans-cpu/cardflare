import { useEffect, useRef } from "react";
import {
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
 * for all tcg's." Each page is the full width of the sheet with the art
 * centred, so a swipe moves one art; a tap still opens it large. Under
 * it, the art's name and a dot per art. One art, no dots and nothing to
 * swipe. The website's card page has the same carousel.
 *
 * `index` is controlled, so the price chips below can move it, and a
 * swipe reports the page it settled on.
 */
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

  /* Moved from outside (a price chip): slide there. */
  useEffect(() => {
    if (index === shown.current) return;
    shown.current = index;
    rail.current?.scrollTo({ x: index * pageWidth, animated: true });
  }, [index, pageWidth]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
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
      <ScrollView
        ref={rail}
        horizontal
        pagingEnabled
        scrollEnabled={several}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        /* Exactly the art's height: a horizontal rail inside the page's
           scroll otherwise stretched to fill the sheet. */
        style={{ width: pageWidth, height: artHeight, flexGrow: 0 }}
      >
        {arts.map((art) => (
          <View key={art.imageUrl} style={{ width: pageWidth, alignItems: "center" }}>
            <CardImage
              imageUrl={art.imageUrl}
              width={artWidth}
              name={name}
              cardNumber={cardNumber}
              caption={art.label}
            />
          </View>
        ))}
      </ScrollView>
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
