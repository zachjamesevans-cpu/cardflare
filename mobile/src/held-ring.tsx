import { MaterialCommunityIcons } from "@expo/vector-icons";
import { View } from "react-native";

import { colors, radius } from "./theme";

/**
 * The green ring on a card you hold, and the corner icon that says which
 * kind: the website's FeedTile mark, for every app surface that draws a
 * wanted card with CardImage.
 *
 * The founder (2026-10-09): "it should show a green highlight around it".
 * One ring, whatever the printing; the icon is the only difference, the
 * same two the website and the room board put in the same corner
 * (package-check for exact, layers for another printing).
 *
 * Drawn OVER the art rather than as a border on it: in React Native a
 * border takes its width out of the box, and a card would shrink the
 * moment you owned it. The caller wraps the CardImage in a View and puts
 * this after it, so the parent is exactly the card's size. Touches pass
 * through to the card underneath.
 *
 * Outset by two by default, the room board's tile, so it sits around the
 * art. `inset` draws it on the art's own edge instead, for a grid that
 * runs tile to tile or a pager that would clip anything outside it.
 * `corner` moves the icon where the top left already holds something.
 */
export function HeldRing({
  match,
  inset = false,
  corner = "left",
}: {
  match: "exact" | "other-printing" | null | undefined;
  inset?: boolean;
  corner?: "left" | "right";
}) {
  if (!match) return null;

  const out = inset ? 0 : -2;

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: out,
          top: out,
          right: out,
          bottom: out,
          borderWidth: 2,
          borderColor: colors.accent,
          /* The art's own radius, plus the two it sits outset by, so the
             ring's inner curve lands on the picture's edge. */
          borderRadius: radius.control / 2 + (inset ? 0 : 2),
          shadowColor: colors.accent,
          shadowOpacity: 0.35,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          zIndex: 5,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: inset ? 4 : 2,
          ...(corner === "left" ? { left: inset ? 4 : 2 } : { right: inset ? 4 : 2 }),
          zIndex: 6,
          borderRadius: 999,
          backgroundColor: colors.surface,
          padding: 1,
        }}
      >
        <MaterialCommunityIcons
          name={match === "exact" ? "package-variant-closed-check" : "layers-outline"}
          size={12}
          color={colors.accent}
        />
      </View>
    </>
  );
}
