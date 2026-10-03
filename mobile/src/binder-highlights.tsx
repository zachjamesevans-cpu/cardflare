import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import type { BinderSummary } from "./api";
import { binderCover } from "./binder-covers";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A profile's binders as a row of circles: the app's half of
 * src/components/binder/binder-highlights.tsx, same circles, same
 * ring, same words.
 *
 * One circle per binder, scrolling sideways, no box round the row, in
 * the owner's order. Each circle is the cover's colour with the
 * binder's first letter in the cover's dark colour, bold and centred,
 * and the name under it on one line. No picture: the founder, "Delete
 * the ability to have a picture on the binder, it's tacky imo." A
 * binder up for trade wears the lime ring and a tiny badge with the
 * trade arrows; a private one a hairline ring. The owner's row ends
 * with a dashed "+" that starts a new binder.
 *
 * A visitor with nothing to open (no binder up for trade) gets no row
 * at all: the server hands over an empty list and this draws nothing.
 */

/** The circle, and the cell it sits in with its label. */
const CIRCLE = 64;
const CELL = 72;
/** The up-for-trade ring: 2px lime, 2px clear of the circle. */
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

/** The binder's first letter, as the circle wears it. */
export function binderInitial(name: string): string {
  return (Array.from(name.trim())[0] ?? "").toUpperCase();
}

function Highlight({
  binder,
  onPress,
}: {
  binder: BinderSummary;
  onPress: () => void;
}) {
  const trade = binder.forTrade;
  const { edge, spine } = binderCover(binder.cover);
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={binder.name}
      style={{ width: CELL, alignItems: "center", gap: spacing(1.5) }}
    >
      {/* The ring sits outside the circle with a gap: lime when the
          binder is up for trade, a hairline when it is private. */}
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
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors[spine],
              fontSize: 26,
              fontWeight: "700",
              lineHeight: 30,
            }}
          >
            {binderInitial(binder.name)}
          </Text>
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
