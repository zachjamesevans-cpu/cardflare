import { Text, View } from "react-native";

import type { CardHit } from "./api";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The small parts the Flare composer is built from, shared so the hub
 * and any other search that draws a card row use the same pieces
 * rather than lookalikes: the art rule, the toggle pill, the search
 * highlight, the stat line, and where a post lands.
 */

/** The art a card leads with: the base printing, the website's rule. */
export function leadArt(hit: CardHit): string | null {
  return (
    hit.printings.find((printing) => printing.id === hit.basePrintingId)?.imageUrl ??
    hit.printings.find((printing) => printing.imageUrl)?.imageUrl ??
    null
  );
}

/**
 * A pill that is either on or off.
 *
 * React Native has no checkboxes worth the name, and the composer's
 * questions (which way does this card point, and what will you take)
 * are answered by picking from a small visible set. A pill shows the
 * choice and the alternatives at the same time, which a switch does
 * not.
 */
export function Pill({
  label,
  active,
  onPress,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(3),
        borderRadius: radius.control,
        borderWidth: active ? 2 : 1,
        borderColor: active ? colors.accent : colors.borderStrong,
        backgroundColor: active ? `${colors.accent}22` : colors.elevated,
        /* The last chip left on cannot be switched off, but it is ON,
           not disabled: dimming it read as greyed out. The founder: "the
           'trade' and 'cash' buttons are kinda grayed out." */
        opacity: disabled && !active ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: active ? colors.textPrimary : colors.textSecondary,
          fontSize: 13,
          fontWeight: active ? "700" : "600",
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}

/** The website's search highlight: the matched part of a name lights up. */
export function Highlighted({ text, term }: { text: string; term: string }) {
  const needle = term.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: `${colors.accent}40` }}>
        {text.slice(at, at + needle.length)}
      </Text>
      {text.slice(at + needle.length)}
    </>
  );
}

/** The stats that apply differ by card type, so only present ones render. */
export function Stats({ hit }: { hit: CardHit }) {
  const stats = [
    hit.cost !== null && { label: "Cost", value: hit.cost },
    hit.life !== null && { label: "Life", value: hit.life },
    hit.power !== null && { label: "Power", value: hit.power },
    hit.counter ? { label: "Counter", value: hit.counter } : false,
  ].filter(Boolean) as { label: string; value: number }[];

  if (stats.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing(3) }}>
      {stats.map((stat) => (
        <Text key={stat.label} style={{ fontSize: 12 }}>
          <Text style={{ color: colors.textMuted }}>{stat.label} </Text>
          <Text style={{ color: colors.textSecondary }}>{stat.value}</Text>
        </Text>
      ))}
    </View>
  );
}

/**
 * Where a posted Flare lands: tonight's board, or, signed in with no
 * live room, the Feed for the people who follow you. The hub decides;
 * the composer just says honestly which one it is doing.
 */
export type PostTarget = { kind: "room"; code: string } | { kind: "list" };
