import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  ApiError,
  describeError,
  lastRoomGame,
  postFlare,
  saveToList,
  searchCards,
  type CardHit,
} from "../api";
import {
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * Posting a Flare, all on one screen. Tapping a result unfolds it in
 * place — every version with its art ("Any printing" first), quantity,
 * note and the Post button, right inside the row. Founder-driven shape:
 * the whole card is the hitbox, the unfold is the same motion the old
 * versions dropdown made, and nothing navigates away, so there is no
 * second screen to swipe back from and no state to lose. Tapping the
 * card header again folds it shut.
 *
 * Same ranked search, same server-side validation, same row anatomy as
 * the website's picker — art, highlighted match, meta line, stats.
 */

/** The art a card leads with: the base printing, the website's rule. */
function leadArt(hit: CardHit): string | null {
  return (
    hit.printings.find((printing) => printing.id === hit.basePrintingId)
      ?.imageUrl ??
    hit.printings.find((printing) => printing.imageUrl)?.imageUrl ??
    null
  );
}

/**
 * A pill that is either on or off.
 *
 * React Native has no checkboxes worth the name, and the board's two
 * questions — which way does this card point, and what will you take —
 * are both answered by picking from a small visible set. A pill shows
 * the choice and the alternatives at the same time, which a switch
 * does not.
 */
/**
 * The board's own toggle, exported so Local's composer is literally the
 * same control rather than one that merely looks like it.
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
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? `${colors.accent}22` : colors.elevated,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: active ? colors.textPrimary : colors.textMuted,
          fontSize: 13,
          fontWeight: active ? "700" : "500",
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}

/** The website's search highlight: the matched part of a name lights up. */
function Highlighted({ text, term }: { text: string; term: string }) {
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
function Stats({ hit }: { hit: CardHit }) {
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
 * Where a posted Flare lands: tonight's board, or — signed in with no
 * live room — the account list, so a midnight Flare never keeps a
 * closed store's room warm. The hub decides; this screen just says
 * honestly which one it is doing.
 */
export type PostTarget = { kind: "room"; code: string } | { kind: "list" };

export function PostFlareScreen({
  target,
  resetSignal,
  onPosted,
  footer,
}: {
  target: PostTarget;
  /** Bumped by the Flare tab on a re-tap while focused: "different card". */
  resetSignal?: number;
  /** A successful post or save landed; the hub refreshes its list. */
  onPosted?: () => void;
  /** The Flare tab's standing list, rendered under the search. */
  footer?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);

  /** Which result is unfolded — one at a time; the form lives inside it. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  /*
   * Which way the card points, and what the poster will take. Both reset
   * with every unfold: they are statements about one card, and a stuck
   * "I have this" would quietly turn the next hunt into an offer.
   */
  const [showcase, setShowcase] = useState(false);
  const [acceptsTrade, setAcceptsTrade] = useState(true);
  const [acceptsCash, setAcceptsCash] = useState(false);

  /*
   * The deck name survives on purpose — across posts, folds, and even the
   * Flare-tab re-tap. Somebody building an RG Luffy types the name once
   * and posts fourteen cards; each one lands in the same folder on the
   * board. Clearing the field is the way out of the deck.
   */
  const [deck, setDeck] = useState("");
  /* Whether the group row is open. The NAME is what sticks; this is
     only whether the field is showing before one has been typed. */
  const [grouping, setGrouping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // So the posted-beat fold-up never fires into an unmounted screen.
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (foldTimer.current) clearTimeout(foldTimer.current);
    },
    [],
  );

  // Re-tapping the Flare tab while already here means "different card":
  // wipe the typed search too. Arriving from another tab never resets —
  // the hub only bumps the counter when this tab was already focused.
  useEffect(() => {
    if (resetSignal) {
      setQuery("");
      setHits([]);
      setExpanded(null);
    }
  }, [resetSignal]);

  /*
   * The scanned room's TCG, when the code came off a tournament's own
   * screen. Loaded once: posting INTO a room searches only that game's
   * cards, while the couch path stays universal.
   */
  const [roomGame, setRoomGame] = useState<string | null>(null);
  useEffect(() => {
    if (target.kind !== "room") return;
    let current = true;
    void lastRoomGame().then((game) => {
      if (current) setRoomGame(game);
    });
    return () => {
      current = false;
    };
  }, [target.kind]);

  // Debounced search: a keystroke pause is the request, not every letter.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }

    const timer = setTimeout(() => {
      void searchCards(query.trim(), target.kind === "room" ? roomGame : null)
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, roomGame, target.kind]);

  /** Unfold a card with a fresh form, or fold it back up. */
  const toggle = (hit: CardHit) => {
    if (busy) return;
    if (expanded === hit.id) {
      setExpanded(null);
      return;
    }
    setExpanded(hit.id);
    setPrintingId(null);
    setQuantity(1);
    setNote("");
    setShowcase(false);
    setAcceptsTrade(true);
    setAcceptsCash(false);
    setError(null);
    setPosted(false);
  };

  const submit = async (hit: CardHit) => {
    setBusy(true);
    setError(null);

    try {
      const entry = {
        cardId: hit.id,
        printingId,
        quantity,
        note: note.trim() || undefined,
        deckLabel: deck.trim() || undefined,
      };

      if (target.kind === "room") {
        await postFlare(target.code, {
          ...entry,
          intent: showcase ? "showcase" : "want",
          acceptsTrade,
          acceptsCash,
        });
      } else {
        /* The saved list is a hunt list. A card you are letting go is
           not a want, so it never lands there. */
        await saveToList(entry);
      }

      // The confirmation happens on the button that was pressed —
      // "Posted ✓" and a success buzz — then the row folds itself up,
      // search intact, ready for the next card on the want list.
      setBusy(false);
      setPosted(true);
      onPosted?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      foldTimer.current = setTimeout(() => {
        setExpanded(null);
        setPosted(false);
      }, 1400);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "at-cap"
          ? target.kind === "room"
            ? "You have hit the Flare cap for this room."
            : "Your list is full. Remove something on the Account tab first."
          : target.kind === "room"
            ? `Could not post the Flare (${describeError(caught)}). Try again.`
            : `Could not save it (${describeError(caught)}). Try again.`,
      );
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}>
      {/*
       * The group, before the cards rather than after them.
       *
       * The mechanism was already here - a deck name that sticks across
       * posts and folds cards into one folder on the board - as an
       * optional text box at the BOTTOM of a form you only see once you
       * have expanded a card. So nobody found it, and the founder read
       * the result as a missing feature: "it would look a little silly to
       * have separate flares in the feed for each card someone needs, if
       * theyre building a full deck. so give an option when posting a
       * flare to have it in thee."
       *
       * Same field, moved to where the decision is actually made. Closed
       * it is one line; open it names the group every card posted after it
       * joins, until it is cleared.
       */}
      <Card>
        {grouping || deck.trim().length > 0 ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2),
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", flex: 1 }}
              >
                {deck.trim().length > 0 ? "Posting into" : "Name the group"}
              </Text>
              <Tap
                accessibilityLabel="Stop grouping"
                onPress={() => {
                  setDeck("");
                  setGrouping(false);
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Clear</Text>
              </Tap>
            </View>
            <Input
              value={deck}
              onChangeText={setDeck}
              placeholder={'e.g. "RG Luffy"'}
              maxLength={40}
              autoCapitalize="words"
            />
            <Muted>
              Every card you post from here joins this group, until you clear
              it. The room shows them as one folder, and so does the Feed.
            </Muted>
          </>
        ) : (
          <Tap
            accessibilityLabel="Start a group"
            onPress={() => setGrouping(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
          >
            <MaterialCommunityIcons
              name="folder-plus-outline"
              size={20}
              color={colors.accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                Start a group
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Building a deck? Post the cards as one thing.
              </Text>
            </View>
          </Tap>
        )}
      </Card>

      <Card>
        <Title>What are you hunting?</Title>
        {/* Said up front, so nobody thinks a couch Flare reached a room. */}
        {target.kind === "list" && (
          <Muted>
            No room right now, so this saves to your list. Every room you join
            will offer to post it.
          </Muted>
        )}
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Card name or number"
          autoFocus
          autoCorrect={false}
        />
        {query.trim().length >= 2 && hits.length === 0 && (
          <Muted>Nothing yet. Keep typing, or check the number.</Muted>
        )}
        {hits.map((hit) => {
          const open = expanded === hit.id;

          return (
            <View
              key={hit.id}
              style={{
                borderColor: open ? `${colors.accent}80` : colors.border,
                borderWidth: 1,
                borderRadius: radius.control,
                padding: spacing(2),
                gap: spacing(2),
              }}
            >
              <Tap
                onPress={() => toggle(hit)}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: spacing(3),
                }}
              >
                <CardImage
                  imageUrl={leadArt(hit)}
                  width={40}
                  name={hit.name}
                  cardNumber={hit.cardNumber}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    <Highlighted text={hit.name} term={query} />
                  </Text>
                  {/* The website's quiet line: number, type, colours — and
                      the printing label when there is only one version. */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      columnGap: spacing(2),
                    }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      <Highlighted text={hit.cardNumber} term={query} />
                    </Text>
                    {[
                      hit.printings.length === 1
                        ? (hit.printings[0]?.label ?? null)
                        : null,
                      hit.cardType,
                      hit.colors.length > 0 ? hit.colors.join(" / ") : null,
                    ]
                      .filter((part): part is string => !!part)
                      .map((part) => (
                        <Text
                          key={part}
                          style={{ color: colors.textMuted, fontSize: 12 }}
                        >
                          {part}
                        </Text>
                      ))}
                  </View>
                  <Stats hit={hit} />
                  {!open && hit.printings.length > 1 && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {`${hit.printings.length} versions, alt arts and promos`}
                    </Text>
                  )}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {open ? "▴" : "▾"}
                </Text>
              </Tap>

              {/*
               * The whole Flare form, unfolded in place: pick the version
               * (any by default), say how many, add a note, post. Tapping
               * the card header folds it back up.
               */}
              {open && (
                <>
                  {/*
                   * Direction first. It decides whether somebody walks
                   * over to offer or to ask, so it is answered before
                   * any of the optional detail.
                   */}
                  {target.kind === "room" && (
                    <>
                      <Body>Is this a card you want, or one you have?</Body>
                      <View style={{ flexDirection: "row", gap: spacing(2) }}>
                        <Pill
                          label="I want this"
                          active={!showcase}
                          onPress={() => setShowcase(false)}
                        />
                        <Pill
                          label="I have this"
                          active={showcase}
                          onPress={() => setShowcase(true)}
                        />
                      </View>

                      <Body>Trade or cash?</Body>
                      <View style={{ flexDirection: "row", gap: spacing(2) }}>
                        {/* Never both off: a Flare nobody can answer is
                            not a Flare. The server enforces it too. */}
                        <Pill
                          label="Trade"
                          active={acceptsTrade}
                          disabled={acceptsTrade && !acceptsCash}
                          onPress={() => setAcceptsTrade(!acceptsTrade)}
                        />
                        <Pill
                          label="Cash"
                          active={acceptsCash}
                          disabled={acceptsCash && !acceptsTrade}
                          onPress={() => setAcceptsCash(!acceptsCash)}
                        />
                      </View>
                    </>
                  )}

                  <Body>Which printing?</Body>
                  <View style={{ gap: spacing(2) }}>
                    {[
                      {
                        id: null as string | null,
                        label: "Any printing",
                        imageUrl: null as string | null,
                      },
                      ...hit.printings.map((printing) => ({
                        id: printing.id as string | null,
                        label: printing.label ?? "Standard printing",
                        imageUrl: printing.imageUrl,
                      })),
                    ].map((option) => (
                      <Tap
                        key={option.id ?? "any"}
                        onPress={() => setPrintingId(option.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing(3),
                          backgroundColor: colors.elevated,
                          borderColor:
                            printingId === option.id
                              ? colors.accent
                              : colors.border,
                          borderWidth: printingId === option.id ? 2 : 1,
                          borderRadius: radius.control,
                          padding: spacing(2),
                        }}
                      >
                        {option.id !== null && (
                          <CardImage
                            imageUrl={option.imageUrl}
                            width={36}
                            name={hit.name}
                            cardNumber={hit.cardNumber}
                            caption={option.label}
                          />
                        )}
                        <Text
                          style={{
                            color: colors.textSecondary,
                            flex: 1,
                            fontSize: 13,
                          }}
                        >
                          {option.label}
                        </Text>
                      </Tap>
                    ))}
                  </View>

                  <Body>How many?</Body>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(3),
                    }}
                  >
                    <Button
                      label="−"
                      variant="secondary"
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                    />
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 20,
                        fontWeight: "700",
                      }}
                    >
                      {quantity}
                    </Text>
                    <Button
                      label="+"
                      variant="secondary"
                      onPress={() => setQuantity((q) => Math.min(99, q + 1))}
                    />
                  </View>

                  <Input
                    value={note}
                    onChangeText={setNote}
                    placeholder="Note for the room (optional)"
                    maxLength={120}
                  />

                  <ErrorLine message={error} />

                  <Button
                    label={
                      target.kind === "room"
                        ? posted
                          ? "Posted ✓"
                          : busy
                            ? "Posting…"
                            : "Post the Flare"
                        : posted
                          ? "Saved ✓"
                          : busy
                            ? "Saving…"
                            : "Save to my list"
                    }
                    onPress={() => void submit(hit)}
                    busy={busy}
                    disabled={busy || posted}
                  />
                </>
              )}
            </View>
          );
        })}
      </Card>
      {footer}
    </ScrollView>
  );
}
