import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  getWantedNearYou,
  serverMessage,
  setLocalTrade,
  type WantedGroup,
  type WantedPage,
} from "../api";
import { HeldRing } from "../held-ring";
import {
  WANTED_PRIVATE_LINE,
  WANTED_SORTS,
  wantedCountLine,
  type WantedSort,
} from "../nearby-shared";
import { colors, gutter, spacing } from "../theme";
import { Button, Card, CardImage, ErrorLine, Loading, Muted, Tap } from "../ui";
import { PersonRow } from "../wanted-near-you";

/** How many people a card shows before "Show all". */
const FIRST_PEOPLE = 5;

/**
 * "Wanted near you": every card of yours somebody near you wants, one
 * section each, people inside. Grouped by card because that is the
 * question - which of mine is wanted - and because a big city can put
 * a hundred people here. The website's page is the same
 * (src/app/feed/wanted/page.tsx).
 *
 * LIVE: read again every time the screen comes into view, so somebody
 * who took their Flare down is gone from it. The founder: "it needs to
 * be 'live'."
 */
export function WantedNearYouScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [sort, setSort] = useState<WantedSort>("most");
  const [page, setPage] = useState<WantedPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  /* The sort a read was for, so a slow answer for the old sort cannot
     land over the new one. */
  const asked = useRef<WantedSort>("most");

  const load = useCallback(async (next: WantedSort) => {
    asked.current = next;
    setError(null);
    try {
      const fresh = await getWantedNearYou(next, 0);
      if (asked.current === next) setPage(fresh);
    } catch (caught) {
      if (asked.current === next) {
        setError(serverMessage(caught) ?? "Could not load this. Try again in a moment.");
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(sort);
    }, [load, sort]),
  );

  const loadMore = async () => {
    if (!page || page.nextOffset === null || more) return;
    setMore(true);
    try {
      const next = await getWantedNearYou(sort, page.nextOffset);
      setPage({ ...next, groups: [...page.groups, ...next.groups] });
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not load more.");
    } finally {
      setMore(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: gutter, gap: spacing(4), paddingBottom: spacing(10) }}
      keyboardShouldPersistTaps="handled"
      /* The draft box opens under a row; the keyboard must not cover it. */
      automaticallyAdjustKeyboardInsets
    >
      {page && page.totalPeople > 0 ? (
        <Muted>{`${wantedCountLine(page.totalPeople)}. ${WANTED_PRIVATE_LINE}`}</Muted>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {WANTED_SORTS.map((option) => {
          const on = option.key === sort;
          return (
            <Tap
              key={option.key}
              accessibilityLabel={`Sort by ${option.label}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setSort(option.key);
                setPage(null);
              }}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accentTint : "transparent",
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(1.5),
              }}
            >
              <Text
                style={{
                  color: on ? colors.accent : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {option.label}
              </Text>
            </Tap>
          );
        })}
      </View>

      <ErrorLine message={error} />

      {!page && !error ? <Loading /> : null}

      {page && page.groups.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: spacing(10) }}>
          <Ionicons name="location-outline" size={24} color={colors.textMuted} />
          <Muted>
            Nobody near you is looking for your cards right now. When someone is, they
            show up here.
          </Muted>
        </Card>
      ) : null}

      {page?.groups.map((group) => (
        <CardSection
          key={group.card.cardId}
          group={group}
          onOpenThread={(threadId) => navigation.navigate("LocalThread", { threadId })}
          onStopped={() => void load(sort)}
        />
      ))}

      {page && page.nextOffset !== null ? (
        <Button
          label="Show more cards"
          variant="secondary"
          busy={more}
          onPress={() => void loadMore()}
        />
      ) : null}
    </ScrollView>
  );
}

/** One card of yours, and the people near you who want it. */
function CardSection({
  group,
  onOpenThread,
  onStopped,
}: {
  group: WantedGroup;
  onOpenThread: (threadId: string) => void;
  onStopped: () => void;
}) {
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = group.people.length;
  const shown = all ? group.people : group.people.slice(0, FIRST_PEOPLE);

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setLocalTrade(group.haveEntryId, false);
      onStopped();
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        gap: spacing(3),
        paddingBottom: spacing(4),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <View>
          <CardImage
            imageUrl={group.card.imageUrl}
            width={52}
            name={group.card.cardName}
            cardNumber={group.card.cardNumber}
            youHave={{ kind: group.card.match, count: 0 }}
          />
          <HeldRing match={group.card.match} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}
          >
            {group.card.cardName}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {`${count} ${count === 1 ? "person wants" : "people want"} this`}
            {group.card.match === "other-printing" ? " · You have another printing" : ""}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing(3) }}>
        {shown.map((person) => (
          <PersonRow
            key={`${person.ask.kind}-${person.ask.id}`}
            person={person}
            onOpenThread={onOpenThread}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        {count > FIRST_PEOPLE ? (
          <Tap
            accessibilityLabel={all ? "Show fewer" : `Show all ${count}`}
            onPress={() => setAll(!all)}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              {all ? "Show fewer" : `Show all ${count}`}
            </Text>
          </Tap>
        ) : null}
        <View style={{ flex: 1 }} />
        <Tap
          accessibilityLabel={`Not trading ${group.card.cardName} anymore`}
          disabled={busy}
          onPress={() => void stop()}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {busy ? "Saving…" : "Not trading this anymore"}
          </Text>
        </Tap>
      </View>
      <ErrorLine message={error} />
    </View>
  );
}
