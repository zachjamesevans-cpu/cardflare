import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import type { BinderSummary } from "./api";
import { binderCover } from "./binder-covers";
import { RemoteImage } from "./remote-image";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A profile's binders as a row of circles: the app's half of
 * src/components/binder/binder-highlights.tsx, same circles, same
 * ring, same words.
 *
 * One circle per binder, scrolling sideways, no box round the row.
 * Each shows the binder's front card, cover-fit and centred, or the
 * cover's colour when it has no card yet, with the name under it on
 * one line. The Trade binder comes first and wears the lime ring and
 * a tiny badge with the trade arrows, because it is the one binder
 * whose cards are up for trade; a custom binder has a plain ring. The
 * owner's row ends with a dashed "+" that starts a new binder.
 *
 * A visitor with nothing to open (every binder private) gets no row
 * at all: the server hands over an empty list and this draws nothing.
 */

/** The circle, and the cell it sits in with its label. */
const CIRCLE = 64;
const CELL = 72;
/** The Trade binder's ring: 2px lime, 2px clear of the circle. */
const RING = 2;
const RING_GAP = 2;

export function BinderHighlights({
  binders,
  yours,
  onOpen,
  onNew,
}: {
  binders: BinderSummary[];
  yours: boolean;
  /** The binder screen, by id. */
  onOpen: (binderId: string) => void;
  /** The create sheet; the owner only. */
  onNew?: () => void;
}) {
  if (binders.length === 0 && !yours) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(1) }}
    >
      {binders.map((binder) => (
        <Highlight key={binder.id} binder={binder} onPress={() => onOpen(binder.id)} />
      ))}
      {yours && onNew ? (
        <Tap
          onPress={onNew}
          accessibilityLabel="New binder"
          style={{ width: CELL, alignItems: "center", gap: spacing(1.5) }}
        >
          <View style={{ padding: RING + RING_GAP }}>
            <View
              style={{
                width: CIRCLE,
                height: CIRCLE,
                borderRadius: CIRCLE / 2,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.borderStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="add" size={26} color={colors.textSecondary} />
            </View>
          </View>
          <Text
            numberOfLines={1}
            style={{ color: colors.textSecondary, fontSize: 11, maxWidth: CELL }}
          >
            New
          </Text>
        </Tap>
      ) : null}
    </ScrollView>
  );
}

function Highlight({
  binder,
  onPress,
}: {
  binder: BinderSummary;
  onPress: () => void;
}) {
  const trade = binder.kind === "trade";
  const { edge } = binderCover(binder.cover);
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={binder.name}
      style={{ width: CELL, alignItems: "center", gap: spacing(1.5) }}
    >
      {/* The ring sits outside the circle with a gap, so the art is
          never under it: lime for the Trade binder, a hairline for the
          rest. */}
      <View
        style={{
          padding: RING_GAP,
          borderRadius: (CIRCLE + 2 * (RING + RING_GAP)) / 2,
          borderWidth: trade ? RING : 1,
          borderColor: trade ? colors.accent : colors.borderStrong,
          margin: trade ? 0 : RING - 1,
        }}
      >
        <View
          style={{
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: CIRCLE / 2,
            overflow: "hidden",
            backgroundColor: colors[edge],
          }}
        >
          {binder.frontImageUrl ? (
            <RemoteImage
              uri={binder.frontImageUrl}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
        </View>
        {trade ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: -RING,
              bottom: -RING,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="swap-horizontal" size={11} color={colors.accentContrast} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ color: colors.textSecondary, fontSize: 11, maxWidth: CELL }}
      >
        {binder.name}
      </Text>
    </Tap>
  );
}
