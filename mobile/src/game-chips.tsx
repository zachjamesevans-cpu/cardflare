import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { gameShortName, type GameSlug } from "./games";
import { splitGames, type GameScope } from "./game-scope";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * The search field with the game inside it - the website's
 * `GamePill` + field, natively.
 *
 * The founder: "most people stick to one maybe two card games, so once
 * they're locked in, it would be nice to not have to see all other
 * TCGs at once." One pill on the left of the box, like a country code
 * in a phone field; tap it and a short list opens under the field,
 * the player's own games first and marked "yours", the others under a
 * hairline, "All games" last. The keyboard stays up throughout.
 *
 * The box wears the Input's own border, radius and height, so it is
 * one control rather than a pill parked beside a field. Inside a room
 * scanned from a tournament's screen the pill wears a lock and does
 * not open.
 */
export function GameSearchField({
  scope,
  playerGames = [],
  onPick,
  ...input
}: {
  scope: GameScope;
  playerGames?: readonly string[];
  /** Null means "all games". */
  onPick: (game: GameSlug | null) => void;
} & Pick<TextInputProps, "value" | "onChangeText" | "placeholder" | "autoFocus">) {
  const [open, setOpen] = useState(false);
  const label = scope.selected ? gameShortName(scope.selected) : "All games";
  const locked = scope.locked && scope.selected !== null;
  const { mine, others } = splitGames(scope, playerGames);

  const pick = (game: GameSlug | null) => {
    setOpen(false);
    onPick(game);
  };

  return (
    <View style={{ gap: spacing(1.5) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(2),
          backgroundColor: colors.canvas,
          borderColor: open ? colors.accent : colors.border,
          borderWidth: 1,
          borderRadius: radius.control,
          paddingHorizontal: spacing(1.5),
          minHeight: 48,
        }}
      >
        {locked ? (
          <View style={pill}>
            <Ionicons name="lock-closed" size={12} color={colors.accent} />
            <Text style={pillLabel}>{label}</Text>
          </View>
        ) : (
          <Tap
            onPress={() => setOpen((value) => !value)}
            accessibilityLabel={`Searching ${label}. Change game`}
            style={pill}
          >
            <Text style={pillLabel}>{label}</Text>
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.accent}
            />
          </Tap>
        )}
        <View style={{ width: 1, height: 24, backgroundColor: colors.border }} />
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          {...input}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          accessibilityLabel="Card name or number"
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.textPrimary,
            fontSize: 16,
            paddingVertical: spacing(3),
          }}
        />
      </View>

      {open && !locked && (
        <View
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            padding: spacing(1.5),
          }}
        >
          {mine.map((game) => (
            <Row
              key={game}
              label={gameShortName(game)}
              on={scope.selected === game}
              yours
              onPress={() => pick(game)}
            />
          ))}
          {mine.length > 0 && others.length > 0 && <Rule />}
          {others.map((game) => (
            <Row
              key={game}
              label={gameShortName(game)}
              on={scope.selected === game}
              onPress={() => pick(game)}
            />
          ))}
          <Rule />
          <Row label="All games" on={scope.selected === null} onPress={() => pick(null)} />
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  on,
  yours = false,
  onPress,
}: {
  label: string;
  on: boolean;
  yours?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={`Search ${label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2),
        borderRadius: 8,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2.5),
        backgroundColor: on ? "rgba(198,238,79,0.15)" : "transparent",
      }}
    >
      <Text
        style={{
          flex: 1,
          color: on ? colors.textPrimary : colors.textSecondary,
          fontSize: 14,
          fontWeight: on ? "600" : "500",
        }}
      >
        {label}
      </Text>
      {on && <Ionicons name="checkmark" size={15} color={colors.accent} />}
      {yours && <Text style={{ color: colors.textMuted, fontSize: 11 }}>yours</Text>}
    </Tap>
  );
}

function Rule() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginVertical: spacing(1.5),
        marginHorizontal: spacing(1.5),
      }}
    />
  );
}

const pill = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing(1.5),
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.accent,
  backgroundColor: "rgba(198,238,79,0.15)",
  paddingHorizontal: spacing(2.5),
  paddingVertical: spacing(1.5),
};

const pillLabel = {
  color: colors.textPrimary,
  fontSize: 13,
  fontWeight: "600" as const,
};
