import { View } from "react-native";

import { colors, radius, accentGlow } from "./theme";

/**
 * The green ring on a card you hold: every app surface that draws a
 * wanted card with CardImage.
 *
 * The founder (2026-10-09): "it should show a green highlight around it".
 * Then (2026-10-11): "let's remove that little 'box' icon that's in the
 * top right of a card if someone has it. let's make the green ring
 * around the card more pronounced, maybe just thicker and more visible."
 * So the ring alone says it, three points wide with a stronger glow, and
 * the corner icon that told exact from another printing is gone; the
 * card viewer still says which in words ("You have another printing").
 *
 * Drawn OVER the art rather than as a border on it: in React Native a
 * border takes its width out of the box, and a card would shrink the
 * moment you owned it. The caller wraps the CardImage in a View and puts
 * this after it, so the parent is exactly the card's size. Touches pass
 * through to the card underneath.
 *
 * Outset by the ring's width by default, so it sits around the art.
 * `inset` draws it on the art's own edge instead, for a grid that runs
 * tile to tile or a pager that would clip anything outside it.
 */
export const HELD_RING_WIDTH = 3;

export function HeldRing({
  match,
  inset = false,
}: {
  match: "exact" | "other-printing" | null | undefined;
  inset?: boolean;
}) {
  if (!match) return null;

  const out = inset ? 0 : -HELD_RING_WIDTH;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: out,
        top: out,
        right: out,
        bottom: out,
        borderWidth: HELD_RING_WIDTH,
        borderColor: colors.accent,
        /* The art's own radius, plus what it sits outset by, so the
           ring's inner curve lands on the picture's edge. */
        borderRadius: radius.control / 2 + (inset ? 0 : HELD_RING_WIDTH),
        shadowColor: colors.accent,
        shadowOpacity: Math.max(0.5, 0.6 * accentGlow),
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        zIndex: 5,
      }}
    />
  );
}
