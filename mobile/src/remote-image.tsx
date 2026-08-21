import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";

/**
 * A picture from the network, kept on the phone once it has been seen.
 *
 * The founder, watching a card he had already looked at appear again:
 * "the 'you can be my samurai' card currently in the feed still takes 3
 * seconds to pop in." Caching the Feed's JSON never touched that —
 * the text arrived instantly and the ART still came down the wire every
 * single time, which is the part anybody actually watches.
 *
 * React Native's own <Image> leans on NSURLCache, whose behaviour
 * depends on headers we do not control and whose memory budget is
 * evicted aggressively. expo-image keeps a real DISK cache, so a card
 * seen yesterday is drawn from local storage today with no request at
 * all — which is what makes reopening the app feel like returning to
 * something rather than loading it.
 *
 * `transition` matters as much as the cache. A picture that appears
 * instantly still reads as a jolt when it snaps in; a short crossfade
 * turns the same event into the image arriving. Cached hits skip it
 * because there was never a gap to cover.
 *
 * `recyclingKey` is what stops a scrolling list showing the previous
 * row's art in this row's frame while the new one decodes.
 */
export function RemoteImage({
  uri,
  style,
  contentFit = "cover",
  contentPosition,
  blurRadius,
  onError,
  accessibilityLabel,
}: {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  contentPosition?: "top" | "center" | "bottom";
  blurRadius?: number;
  onError?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Image
      source={uri ? { uri } : null}
      style={style}
      contentFit={contentFit}
      contentPosition={contentPosition}
      blurRadius={blurRadius}
      onError={onError}
      accessibilityLabel={accessibilityLabel}
      /* Memory for this session, disk for every session after it. */
      cachePolicy="memory-disk"
      /* Long enough to read as a fade, short enough not to feel slow.
         A cached hit never sees it. */
      transition={140}
    />
  );
}
