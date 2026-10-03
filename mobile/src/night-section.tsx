import type { PropsWithChildren, ReactNode } from "react";
import { Text, View } from "react-native";

import { colors, spacing } from "./theme";

/**
 * How a Night's page is divided: a small uppercase label, a hairline,
 * and air. Not a card per section.
 *
 * The founder (2026-10-03): "USE LESS CONTAINERIZATION. Not every
 * section needs a giant rounded rectangle. Use spacing, typography,
 * dividers, small surface changes for hierarchy." The website's
 * sections wear `text-xs tracking-wide text-text-muted`; this is the
 * same label at the phone's size. The Matches card and the Mutual
 * match block are the two things on the page allowed a box, because
 * they are the two things that should pop.
 */
export function SectionLabel({
  children,
  right,
}: PropsWithChildren<{
  /** Something on the label's line, at the end: a filter, a count. */
  right?: ReactNode;
}>) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing(2),
        minHeight: 24,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        {children}
      </Text>
      {right ?? null}
    </View>
  );
}

/** The hairline between two sections. */
export function Hairline() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

/**
 * One section: the label, its content, and the hairline under it.
 * `gap` is the air inside; the page decides the air between sections.
 */
export function NightSection({
  label,
  right,
  children,
  last = false,
}: PropsWithChildren<{
  label: string;
  right?: ReactNode;
  /** The last section has nothing under it to divide from. */
  last?: boolean;
}>) {
  return (
    <View style={{ gap: spacing(2.5), paddingBottom: last ? 0 : spacing(4) }}>
      <SectionLabel right={right}>{label}</SectionLabel>
      {children}
      {last ? null : <Hairline />}
    </View>
  );
}
