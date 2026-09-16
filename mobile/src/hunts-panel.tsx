import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import type { FeedCard, Hunt } from "./api";
import { CardRail } from "./card-rail";
import { colors, radius, spacing } from "./theme";
import { Body, Button, Card, Tap, Title } from "./ui";

/**
 * Somebody's hunts, on their profile. The app's half of
 * src/components/players/hunts-panel.tsx - same rows, same words, same
 * order, as everything on both platforms has to be.
 *
 * A HUNT IS A FOLDER, and it opens. The founder: "hunts doesn't really
 * do anything rn. look at it. think of the carousel we were using
 * previously. this should be a carousel of cards someone is looking for
 * nested into a folder. go to my profile. there's nothing i can tap or
 * add to."
 *
 * Right on every count. It was a name and two numbers - a receipt for
 * cards you could not see, on a panel with nothing to press. So the row
 * is a lid now: tap it and the cards are underneath, drawn by the same
 * `CardRail` the Feed uses, which means they zoom and swipe exactly
 * like every other card in the app. Nothing new was invented to show
 * them.
 *
 * A hunt with nothing left is not hidden. Finishing one is the good
 * outcome, and a profile that quietly dropped them would only ever show
 * unfinished work.
 */
export function HuntsPanel({
  hunts,
  limit,
  yours,
  onAdd,
}: {
  hunts: Hunt[];
  limit?: number;
  yours?: boolean;
  /** Post into this hunt - the composer, with the group already named. */
  onAdd?: (name: string) => void;
}) {
  /*
   * WHICH FOLDER IS OPEN, at most one.
   *
   * Opening a second closes the first: a profile with five hunts open
   * is five rails and a scroll, which is the wall of cards the folders
   * exist to avoid. The first one opens itself, so the panel is never
   * a list of closed lids with nothing to look at.
   */
  const [open, setOpen] = useState<string | null>(hunts[0]?.name ?? null);

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Ionicons name="locate-outline" size={16} color={colors.accent} />
          <Title>Hunts</Title>
        </View>
        {limit ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {hunts.length} of {limit}
          </Text>
        ) : null}
      </View>

      {hunts.length === 0 ? (
        <>
          <Body>
            {yours
              ? "Name a group when you post and every card you add joins it. The set shows up here, with what is left and what you have found."
              : "No hunts yet."}
          </Body>
          {/* Somewhere to press. An empty panel that only explains what
              would happen is the thing the founder was looking at. */}
          {yours && onAdd ? (
            <Button
              label="Start a hunt"
              variant="secondary"
              onPress={() => onAdd("")}
            />
          ) : null}
        </>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {hunts.map((hunt) => (
            <HuntFolder
              key={hunt.name}
              hunt={hunt}
              open={open === hunt.name}
              onToggle={() => setOpen(open === hunt.name ? null : hunt.name)}
              onAdd={yours && onAdd ? () => onAdd(hunt.name) : undefined}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function HuntFolder({
  hunt,
  open,
  onToggle,
  onAdd,
}: {
  hunt: Hunt;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  /*
   * An older server sends a hunt with no `cards` at all. The lid still
   * works, the counts are still true, and what is underneath is the
   * honest "nothing to draw" rather than a crash.
   */
  const cards = hunt.cards ?? [];

  /* The rail speaks FeedCard, which is what every other card in the app
     is drawn from - so a hunt's cards zoom and swipe like the rest. */
  const rail: FeedCard[] = cards.map((card) => ({
    cardId: card.cardId,
    cardName: card.cardName,
    cardNumber: card.cardNumber,
    imageUrl: card.imageUrl,
    match: null,
    /* Found reads as found: the same dimming a traded card wears on a
       Flare, so one visual vocabulary covers both. */
    state: card.found ? "found" : "open",
  }));

  return (
    <View
      style={{
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: open ? colors.accent : colors.border,
        backgroundColor: colors.elevated,
        overflow: "hidden",
      }}
    >
      <Tap
        onPress={onToggle}
        accessibilityLabel={`${hunt.name}, ${open ? "open" : "closed"}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(2.5),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
            flexShrink: 1,
          }}
        >
          <Ionicons
            name={open ? "folder-open" : "folder"}
            size={15}
            color={open ? colors.accent : colors.textMuted}
          />
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "700", flexShrink: 1 }}
          >
            {hunt.name}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(1.5),
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              color: hunt.looking > 0 ? colors.accent : colors.textMuted,
              fontSize: 12,
            }}
          >
            {hunt.looking > 0 ? lookingLabel(hunt) : "All found"}
          </Text>
          {hunt.found > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              · {hunt.found} found
            </Text>
          ) : null}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.textMuted}
          />
        </View>
      </Tap>

      {open ? (
        <View
          style={{
            gap: spacing(2),
            paddingHorizontal: spacing(3),
            paddingBottom: spacing(3),
          }}
        >
          {rail.length > 0 ? (
            <CardRail cards={rail} width={72} />
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Nothing to show yet.
            </Text>
          )}
          {onAdd ? (
            <Button label="Add cards" variant="secondary" onPress={onAdd} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "3 left", or "3 left · 5 copies" when somebody wants more than one of
 * something. The copies only show when they differ from the card count,
 * because "3 left · 3 copies" is the same fact twice.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.lookingCopies > hunt.looking) {
    return `${hunt.looking} left · ${hunt.lookingCopies} copies`;
  }
  return `${hunt.looking} left`;
}
