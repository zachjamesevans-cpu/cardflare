import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import { gameShortName, type GameSlug } from "./games";
import type { GameScope } from "./game-scope";
import { Tap } from "./ui";
import { colors, spacing } from "./theme";

/**
 * The game chips above a card search - the website's chip row, in the
 * app's own pill: accent border and a tinted fill when on, the border
 * colour and muted text when off, exactly the pill the post screen
 * already uses for "want" and "have". One row, scrolling sideways, so
 * six games never wrap into a wall above the keyboard.
 *
 * Locked (inside a room scanned off a tournament's screen) the row is
 * one chip with a lock on it and nothing to tap: the code decided.
 */
export function GameChips({
  scope,
  onPick,
}: {
  scope: GameScope;
  /** Null means "all games". */
  onPick: (game: GameSlug | null) => void;
}) {
  if (scope.locked && scope.selected) {
    return (
      <View style={{ flexDirection: "row" }}>
        <View style={chip(true)}>
          <Ionicons name="lock-closed" size={11} color={colors.accent} />
          <Text style={label(true)}>{gameShortName(scope.selected)} cards only</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(1.5) }}
      keyboardShouldPersistTaps="handled"
    >
      <Tap
        onPress={() => onPick(null)}
        accessibilityLabel="Search every game"
        style={chip(scope.selected === null)}
      >
        <Text style={label(scope.selected === null)}>All games</Text>
      </Tap>
      {scope.chips.map((game) => {
        const on = scope.selected === game;
        return (
          <Tap
            key={game}
            onPress={() => onPick(game)}
            accessibilityLabel={`Search ${gameShortName(game)} cards`}
            style={chip(on)}
          >
            <Text style={label(on)}>{gameShortName(game)}</Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

const chip = (on: boolean) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing(1),
  borderRadius: 999,
  borderWidth: 1,
  borderColor: on ? colors.accent : colors.border,
  backgroundColor: on ? "rgba(198,238,79,0.15)" : "transparent",
  paddingHorizontal: spacing(3),
  paddingVertical: spacing(1.5),
});

const label = (on: boolean) => ({
  color: on ? colors.textPrimary : colors.textMuted,
  fontSize: 13,
  fontWeight: on ? ("600" as const) : ("500" as const),
});
