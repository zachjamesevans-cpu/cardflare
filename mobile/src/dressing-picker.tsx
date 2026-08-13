import { ScrollView, Text, View } from "react-native";

import { CosmeticCard } from "./cosmetic-card";
import { Tap } from "./ui";
import { colors, spacing } from "./theme";

/**
 * Choosing a border and a holo for one card, out of what is owned.
 *
 * The website's dressing picker in React Native: two horizontal rails of
 * the SAME card wearing each option, because "how would my Luffy look in
 * Galaxy" is the actual question and a placeholder cannot answer it.
 *
 * Owned items only — this is a dressing room, not the shop. The store
 * section on this same screen is where anything missing gets bought.
 */

export interface DressingOption {
  slug: string;
  name: string;
}

const TILE = 56;

export function DressingPicker({
  imageUrl,
  frames,
  holos,
  frame,
  holo,
  effect,
  onPick,
}: {
  imageUrl: string | null;
  frames: DressingOption[];
  holos: DressingOption[];
  /** The currently chosen pair, always concrete slugs. */
  frame: string | null;
  holo: string | null;
  /** Profile-wide, worn in every preview so it stays honest. */
  effect: string | null;
  onPick: (next: { frame: string | null; holo: string | null }) => void;
}) {
  const rail = (kind: "frame" | "holo", options: DressingOption[]) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(0.5) }}
    >
      {options.map((option) => {
        const selected = option.slug === (kind === "frame" ? frame : holo);

        return (
          <Tap
            key={option.slug}
            onPress={() =>
              onPick(
                kind === "frame"
                  ? { frame: option.slug, holo }
                  : { frame, holo: option.slug },
              )
            }
            style={{ width: TILE, gap: spacing(1) }}
          >
            <View
              style={{
                borderRadius: 8,
                borderWidth: 2,
                borderColor: selected ? colors.accent : "transparent",
              }}
            >
              <CosmeticCard
                imageUrl={imageUrl}
                width={TILE - 4}
                frame={kind === "frame" ? option.slug : frame}
                holo={kind === "holo" ? option.slug : holo}
                effect={effect}
              />
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: selected ? colors.accent : colors.textSecondary,
                fontSize: 10,
                fontWeight: selected ? "700" : "400",
              }}
            >
              {option.name}
            </Text>
          </Tap>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={{ gap: spacing(1) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
          Border
        </Text>
        {rail("frame", frames)}
      </View>
      <View style={{ gap: spacing(1) }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
          Holo pattern
        </Text>
        {rail("holo", holos)}
      </View>
    </View>
  );
}
