import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import type { BinderSummary } from "./api";
import { BinderCover } from "./binder-cover";
import { PROFILE_INSET } from "./profile-tabs";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A profile's binders as a row of small binders: the app's half of
 * src/components/binder/binder-highlights.tsx, same binders, same
 * ring, same words.
 *
 * One per binder, scrolling sideways, no box round the row, in the
 * owner's order. Each one is the binder itself, small: the zip binder
 * the Binders list and the binder screen draw, in its cover colour,
 * with the name under it on one line. The founder, on the circles
 * this row started as: "Thought about the circle on your profile for
 * binders being actual binders? Like it'll show the actual binder as
 * a curved rectangle like how it is under the binder view." No
 * picture on the cover: "it's tacky imo."
 *
 * A binder up for trade wears the lime ring and a tiny badge with the
 * trade arrows; a private one a hairline ring. The ring follows the
 * binder's shape: nearly square on the spine side, rounded on the
 * open side. The owner's row ends with a dashed binder outline and a
 * "+" that starts a new one.
 *
 * A visitor with nothing to open (no binder up for trade) gets no row
 * at all: the server hands over an empty list and this draws nothing.
 */

/** The small binder (the cover's xs box), and the cell it sits in with its label. */
const BINDER = { width: 58, height: 76 };
const CELL = 72;
/** The up-for-trade ring: 2px lime, 2px clear of the binder. */
const RING = 2;
const RING_GAP = 2;
/** The cover's corners: 2 on the spine side, 10% of the width on the open side. */
const SPINE_RADIUS = 2;
const OPEN_RADIUS = Math.round(BINDER.width * 0.1);

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
      /* The row scrolls from edge to edge of the screen, the way the
         profile runs now, and rests with its first binder in line
         with the name above it. */
      contentContainerStyle={{
        gap: spacing(2),
        paddingVertical: spacing(1),
        paddingHorizontal: PROFILE_INSET,
      }}
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
                width: BINDER.width,
                height: BINDER.height,
                borderTopLeftRadius: SPINE_RADIUS,
                borderBottomLeftRadius: SPINE_RADIUS,
                borderTopRightRadius: OPEN_RADIUS,
                borderBottomRightRadius: OPEN_RADIUS,
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
  const trade = binder.forTrade;
  /* The ring's corners are the cover's, grown by the gap it sits off
     the binder, so the ring hugs the shape. */
  const grow = RING_GAP + (trade ? RING : 1);
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={binder.name}
      style={{ width: CELL, alignItems: "center", gap: spacing(1.5) }}
    >
      {/* The ring sits outside the binder with a gap: lime when the
          binder is up for trade, a hairline when it is private. */}
      <View
        style={{
          padding: RING_GAP,
          borderTopLeftRadius: SPINE_RADIUS + grow,
          borderBottomLeftRadius: SPINE_RADIUS + grow,
          borderTopRightRadius: OPEN_RADIUS + grow,
          borderBottomRightRadius: OPEN_RADIUS + grow,
          borderWidth: trade ? RING : 1,
          borderColor: trade ? colors.accent : colors.borderStrong,
          margin: trade ? 0 : RING - 1,
        }}
      >
        <BinderCover cover={binder.cover} size="xs" plain />
        {trade ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: -RING - 4,
              bottom: -RING - 4,
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
