import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { FeedCard, Hunt, HuntCard } from "./api";
import { CardImage } from "./ui";
import { colors, radius, spacing } from "./theme";
import { Body, Button, Card, Tap, Title } from "./ui";
import type { ZoomCard } from "./ui";

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
 * IT IS ALSO A CHECKLIST. The founder: "needs to be a simply way in
 * hunts to mark off if you've already found that card... you can check
 * them off yourself as you collect the cards." Most cards arrive by
 * pull, purchase or a friend rather than a trade here, so a list only a
 * trade could tick was wrong about most of its own boxes.
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
  onTick,
}: {
  hunts: Hunt[];
  limit?: number;
  yours?: boolean;
  /** Post into this hunt - the composer, with the group already named. */
  onAdd?: (name: string) => void;
  /** Tick a card off, or untick it. Absent on somebody else's profile. */
  onTick?: (flareId: string, found: boolean) => Promise<void>;
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
              onTick={yours ? onTick : undefined}
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
  onTick,
}: {
  hunt: Hunt;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  onTick?: (flareId: string, found: boolean) => Promise<void>;
}) {
  /*
   * An older server sends a hunt with no `cards` at all. The lid still
   * works, the counts are still true, and what is underneath is the
   * honest "nothing to draw" rather than a crash.
   */
  const cards = hunt.cards ?? [];

  /* The shelf the zoom pages along, so opening one card lets you swipe
     the whole folder - the same shelf the Feed's rails hand their
     tiles. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    youHave: null,
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
          {cards.length > 0 ? (
            /*
             * The rail is drawn here rather than through `CardRail`,
             * because each card carries a box of its own underneath.
             * Same tile, same zoom, same shelf - the tick is the only
             * thing the Feed's rail does not need.
             */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(0.5) }}
            >
              {cards.map((card, index) => (
                <View key={card.cardId} style={{ gap: spacing(1) }}>
                  <CardImage
                    imageUrl={card.imageUrl}
                    width={72}
                    name={card.cardName}
                    cardNumber={card.cardNumber}
                    /* Found reads as found: the same dimming a traded
                       card wears on a Flare. */
                    state={card.found ? "found" : "open"}
                    siblings={shelf}
                    position={index}
                  />
                  {onTick ? <TickBox card={card} onTick={onTick} /> : null}
                </View>
              ))}
            </ScrollView>
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

/**
 * One box, under one card.
 *
 * OPTIMISTIC, because the whole value of a checklist is that ticking
 * feels like nothing. Somebody standing at a counter with a binder open
 * taps five of these in a row, and a spinner between each turns a
 * checklist back into a form. The box paints immediately and the server
 * confirms behind it; a failed write puts it back and says so rather
 * than leaving a tick that was never saved.
 *
 * A card a real TRADE closed has no box: that fact belongs to the trade,
 * and a box offering to untick it would be lying about what it does.
 */
function TickBox({
  card,
  onTick,
}: {
  card: HuntCard;
  onTick: (flareId: string, found: boolean) => Promise<void>;
}) {
  const [found, setFound] = useState(card.found);
  const [busy, setBusy] = useState(false);

  /* The list can be replaced under us by the answer to somebody else's
     tick, so the server's word wins whenever it changes. */
  useEffect(() => setFound(card.found), [card.found]);

  if (card.tradedAway) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center" }}>
        Traded
      </Text>
    );
  }

  return (
    <Tap
      disabled={busy}
      accessibilityLabel={`${found ? "Unmark" : "Mark"} ${card.cardName} as found`}
      onPress={() => {
        const next = !found;
        setFound(next);
        setBusy(true);
        onTick(card.flareId, next)
          .catch(() => setFound(!next))
          .finally(() => setBusy(false));
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: found ? colors.accent : colors.border,
        backgroundColor: found ? colors.accent : "transparent",
        paddingVertical: 3,
      }}
    >
      <Ionicons
        name="checkmark"
        size={11}
        color={found ? colors.canvas : colors.textSecondary}
      />
      <Text
        style={{
          color: found ? colors.canvas : colors.textSecondary,
          fontSize: 10,
          fontWeight: "700",
        }}
      >
        {found ? "Got it" : "Mark"}
      </Text>
    </Tap>
  );
}
