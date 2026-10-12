import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { DotsButton, SheetBackdrop } from "../action-menu";
import {
  getWantedNearYou,
  serverMessage,
  setLocalTrade,
  type WantedGroup,
  type WantedPage,
} from "../api";
import { HeldRing } from "../held-ring";
import { WANTED_PRIVATE_LINE, wantedCountLine } from "../nearby-shared";
import { SwipeToClose } from "../sheet-swipe";
import { colors, gutter, radius, spacing } from "../theme";
import { Button, Card, CardImage, ErrorLine, Loading, Muted, Tap } from "../ui";
import { PersonRow } from "../wanted-near-you";

const COLUMNS = 3;
const GAP = spacing(3);

/**
 * "Wanted near you", as your binder: the cards of yours somebody near
 * you wants, in a grid, each wearing how many people want it. Tap one
 * and its people slide up. The founder, of the list this replaced:
 * "seems like a lot of info for someone." The first screen is card art
 * and numbers; people appear only for the card you picked. The
 * website's page is the same (src/app/feed/wanted/page.tsx).
 *
 * Most wanted first, and closest first inside a card: the order a
 * person would pick, so there is nothing to sort.
 *
 * LIVE: read again every time the screen comes into view, so somebody
 * who took their Flare down is gone from it.
 */
export function WantedNearYouScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const route = useRoute<RouteProp<StackParams, "WantedNearYou">>();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState<WantedPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [openCard, setOpenCard] = useState<string | null>(route.params?.cardId ?? null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await getWantedNearYou("most", 0));
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not load this. Try again in a moment.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loadMore = async () => {
    if (!page || page.nextOffset === null || more) return;
    setMore(true);
    try {
      const next = await getWantedNearYou("most", page.nextOffset);
      setPage({ ...next, groups: [...page.groups, ...next.groups] });
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not load more.");
    } finally {
      setMore(false);
    }
  };

  const tile = Math.floor((width - gutter * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const open = page?.groups.find((group) => group.card.cardId === openCard) ?? null;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={{ padding: gutter, gap: spacing(4), paddingBottom: spacing(10) }}
      >
        {page && page.totalPeople > 0 ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
              {wantedCountLine(page.totalPeople)}
            </Text>
            <Muted>{WANTED_PRIVATE_LINE}</Muted>
          </View>
        ) : null}

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

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
          {page?.groups.map((group) => (
            <WantedTile
              key={group.card.cardId}
              group={group}
              width={tile}
              onPress={() => setOpenCard(group.card.cardId)}
            />
          ))}
        </View>

        {page && page.nextOffset !== null ? (
          <Button
            label="Show more cards"
            variant="secondary"
            busy={more}
            onPress={() => void loadMore()}
          />
        ) : null}
      </ScrollView>

      {open ? (
        <PeopleForCard
          group={open}
          onClose={() => setOpenCard(null)}
          onOpenThread={(threadId) => {
            setOpenCard(null);
            navigation.navigate("LocalThread", { threadId });
          }}
          onStopped={() => {
            setOpenCard(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

/** One card in the grid: the art, ringed as yours, and how many want it. */
function WantedTile({
  group,
  width,
  onPress,
}: {
  group: WantedGroup;
  width: number;
  onPress: () => void;
}) {
  const count = group.people.length;
  return (
    <Tap
      accessibilityLabel={`${group.card.cardName}, ${count} ${count === 1 ? "person wants" : "people want"} it`}
      onPress={onPress}
    >
      <View>
        <CardImage
          imageUrl={group.card.imageUrl}
          width={width}
          name={group.card.cardName}
          cardNumber={group.card.cardNumber}
          youHave={{ kind: group.card.match, count: 0 }}
        />
        <HeldRing match={group.card.match} />
        <CountBadge count={count} />
      </View>
    </Tap>
  );
}

/** The green number on a card's corner: how many people near you want it. */
function CountBadge({ count }: { count: number }) {
  return (
    <View
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        minWidth: 28,
        height: 28,
        paddingHorizontal: 7,
        borderRadius: 14,
        backgroundColor: colors.accent,
        borderWidth: 2,
        borderColor: colors.canvas,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.accentContrast, fontSize: 13, fontWeight: "800" }}>
        {count}
      </Text>
    </View>
  );
}

/**
 * One card's people, sliding up from the bottom: closest first, the
 * ones already messaged at the foot. "Not trading this anymore" is
 * behind the three dots, out of the way of the thing you came to do.
 */
function PeopleForCard({
  group,
  onClose,
  onOpenThread,
  onStopped,
}: {
  group: WantedGroup;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onStopped: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = group.people.length;

  /* A different card is a fresh sheet. */
  useEffect(() => {
    setMenu(false);
    setError(null);
  }, [group.card.cardId]);

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
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
          <SwipeToClose
            onClose={onClose}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing(4),
              paddingBottom: spacing(4) + insets.bottom,
              gap: spacing(3),
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}
                >
                  {group.card.cardName}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {`${count} ${count === 1 ? "person wants" : "people want"} this`}
                  {group.card.match === "other-printing" ? " · You have another printing" : ""}
                </Text>
              </View>
              <DotsButton label="More for this card" onPress={() => setMenu(!menu)} />
            </View>

            {menu ? (
              <Tap
                accessibilityLabel={`Not trading ${group.card.cardName} anymore`}
                disabled={busy}
                onPress={() => void stop()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(2),
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  padding: spacing(3),
                }}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                  {busy ? "Saving…" : "Not trading this anymore"}
                </Text>
              </Tap>
            ) : null}
            <ErrorLine message={error} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing(3) }}
            >
              {group.people.map((person) => (
                <PersonRow
                  key={`${person.ask.kind}-${person.ask.id}`}
                  person={person}
                  onOpenThread={onOpenThread}
                />
              ))}
            </ScrollView>
          </SwipeToClose>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
