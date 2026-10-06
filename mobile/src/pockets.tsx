import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { BINDER_LAYOUT, POCKETS_PER_PAGE } from "./binder-covers";
import { QuantityBadge } from "./quantity-badge";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A binder's page, taken apart: the app's half of
 * src/components/binder/pockets.tsx.
 *
 * The binder screen drew these for itself. A hunt is drawn like a
 * binder now (the founder: "Do you think the Hunts feature should
 * just be binders instead of lists? So it's all kinda the same
 * language."), so the page frame, the pocket, the empty pocket, the
 * "+" pocket and the dots live here once and both screens draw them.
 * What a pocket holds and what a tap on it does is the screen's
 * business; what a pocket IS, its ring, its clipping, its measure, is
 * decided here and nowhere else.
 *
 * THE GRID is measured, never guessed. The page frame reports its
 * width through onLayout and the pocket is a third of what is left
 * inside the frame's padding and the two gaps, floored, so three
 * always fit on a row. The first build read the window's width and
 * drew the frame's 1pt border on top of the arithmetic: three pockets
 * plus two gaps came to 2pt more than the frame had inside its
 * border, the third pocket wrapped, and the founder's screenshots
 * showed two pockets to a row on a 3x3. Here the border is part of
 * PAGE_PAD, so what is measured is what is divided.
 */

/** The ring round each pocket, the gap between them. */
export const POCKET_RING = 2;
export const POCKET_GAP = spacing(2);
/**
 * The page frame: PAGE_PAD is everything between the frame's outer
 * edge and the first pocket, the 1pt border included, so the measured
 * width minus two of these is exactly what the pockets have.
 */
export const PAGE_BORDER = 1;
export const PAGE_PAD = spacing(3);

/** What one page's grid measures, in points. */
export interface Geometry {
  pageWidth: number;
  pocketWidth: number;
  pocketHeight: number;
  slotW: number;
  slotH: number;
}

/**
 * The pocket, from the page frame's measured width: three across,
 * always, floored so three of them and two gaps never outgrow the row.
 */
export function pocketWidthFor(pageWidth: number): number {
  return Math.floor((pageWidth - 2 * PAGE_PAD - 2 * POCKET_GAP) / 3);
}

export function geometryFor(pageWidth: number): Geometry {
  const pocketWidth = pageWidth > 0 ? pocketWidthFor(pageWidth) : 0;
  const pocketHeight = Math.round((pocketWidth * 88) / 63);
  return {
    pageWidth,
    pocketWidth,
    pocketHeight,
    slotW: pocketWidth + POCKET_GAP,
    slotH: pocketHeight + POCKET_GAP,
  };
}

/** Where pocket `index` sits on its page, in the page's coordinates. */
export function cellOf(index: number, geometry: Geometry) {
  const col = index % BINDER_LAYOUT;
  const row = Math.floor(index / BINDER_LAYOUT);
  return { x: PAGE_PAD + col * geometry.slotW, y: PAGE_PAD + row * geometry.slotH };
}

/**
 * One page: the frame nine pockets sit in, three across. The frame's
 * border is part of PAGE_PAD (see the top of the file), so the
 * pockets have exactly the width the arithmetic gave them. The
 * children are the nine pockets, in order.
 */
export function PageFrame({
  geometry,
  children,
}: {
  geometry: Geometry;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        width: geometry.pageWidth,
        padding: PAGE_PAD - PAGE_BORDER,
        borderRadius: radius.card,
        borderWidth: PAGE_BORDER,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: POCKET_GAP,
      }}
    >
      {children}
    </View>
  );
}

/**
 * A pocket with something in it: a black ring with the sleeve's lip
 * caught along the top, and whatever the screen puts inside, clipped.
 *
 * Exactly the width and height it is given, and nothing inside can
 * widen it: the screen tells its picture the width inside the ring
 * (`pocketWidth - 2 * POCKET_RING`) and the pocket clips the rest.
 * Laid out where the page puts it, always; while its own card is in
 * the air (the binder's hold and drag) it is the empty dashed outline
 * of where the card is or will land, and where it will land it wears
 * the accent ring. The drag itself is the page frame's gesture, not the
 * pocket's, so a pocket is only ever a picture of a state. `corner` is
 * drawn over the lip: the copies count, a check, a chip.
 */
export function Pocket({
  geometry,
  accessibilityLabel,
  placeholder = false,
  targeted = false,
  dimmed = false,
  children,
  corner,
}: {
  geometry: Geometry;
  accessibilityLabel: string;
  /** Its card is in the air: an empty dashed outline. */
  placeholder?: boolean;
  /** A held card is over it: the accent ring. */
  targeted?: boolean;
  /** Nothing left to do with it: half strength. */
  dimmed?: boolean;
  children: ReactNode;
  corner?: ReactNode;
}) {
  const { pocketWidth: width, pocketHeight: height } = geometry;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        width,
        height,
        borderRadius: 5,
        borderWidth: placeholder ? 1 : POCKET_RING,
        borderStyle: placeholder ? "dashed" : "solid",
        borderColor: targeted
          ? colors.accent
          : placeholder
            ? colors.borderStrong
            : colors.canvas,
        backgroundColor: colors.canvas,
        overflow: "hidden",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {placeholder ? null : (
        <>
          {children}
          <SleeveLip />
          {corner}
        </>
      )}
    </View>
  );
}

/** A visitor's empty pocket: plain black, nothing to do. */
export function EmptyPocket({ width, height }: { width: number; height: number }) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 5,
        backgroundColor: colors.canvas,
        borderWidth: POCKET_RING,
        borderColor: "rgba(255,255,255,0.06)",
      }}
    />
  );
}

/**
 * An empty pocket on the owner's page is a way in: the founder,
 * "there should be a + on the open card areas in the binder to add a
 * card that way." The tap is for THAT pocket: the founder, "Adding a
 * card in a specific slot should put that exact card there." A held
 * card dropped on it goes in it.
 */
export function AddPocket({
  width,
  height,
  targeted = false,
  onPress,
}: {
  width: number;
  height: number;
  targeted?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel="Add cards"
      style={{
        width,
        height,
        borderRadius: 5,
        backgroundColor: colors.canvas,
        borderWidth: targeted ? POCKET_RING : 1,
        borderStyle: targeted ? "solid" : "dashed",
        borderColor: targeted ? colors.accent : colors.borderStrong,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Text
        style={{
          color: colors.accent,
          fontSize: Math.min(28, Math.round(width / 3)),
          fontWeight: "300",
          lineHeight: Math.min(30, Math.round(width / 3) + 2),
        }}
      >
        +
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600" }}>
        Add
      </Text>
    </Tap>
  );
}

/** The sleeve lip: a thin highlight where the plastic folds. */
export function SleeveLip() {
  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.22)", "transparent"]}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6%" }}
    />
  );
}

/** The copies, in a corner, when there is more than one: the shared tag. */
export function Copies({ quantity }: { quantity: number }) {
  return (
    <QuantityBadge
      quantity={quantity}
      style={{ position: "absolute", top: 4, left: 4 }}
    />
  );
}

/** Which page is open, under the pages: the open one long, the rest dots. */
export function PageDots({ at, of }: { at: number; of: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {Array.from({ length: of }, (_, index) => (
        <View
          key={index}
          style={{
            height: 6,
            width: index === at ? 16 : 6,
            borderRadius: 3,
            backgroundColor: index === at ? colors.accent : colors.borderStrong,
          }}
        />
      ))}
    </View>
  );
}

/** The pocket's accessibility line: which pocket of the nine. */
export function pocketLabel(name: string, index: number, more = ""): string {
  return `${name}, pocket ${index + 1} of ${POCKETS_PER_PAGE}${more}`;
}
