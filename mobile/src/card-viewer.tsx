import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CardHit, ScanMatch } from "./api";
import { CardSelectSheet } from "./card-select";
import { leadArt } from "./flare-bits";
import { RemoteImage } from "./remote-image";
import {
  FIND_THE_CARD,
  LEAVE_EMPTY,
  MIGHT_BE_THESE,
  NOT_SURE,
  NOT_THIS_CARD,
  OTHER_MATCHES,
  OTHER_PRINTING,
  OUR_MATCH,
  POCKET_EMPTY,
  POCKET_TAKEN,
  POCKET_UNREAD,
  POCKETS_PER_PAGE,
  THATS_IT,
  YOUR_PHOTO,
} from "./scan-copy";
import { scanHit } from "./scan-hit";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, SheetClose, Tap } from "./ui";

/**
 * The card viewer: one full screen for checking what a photo was read
 * as, used by the single scan's answer and by the page check alike. The
 * founder (2026-10-09): "instead of clicking them and scrolling down to
 * see which card was selected, it should just have a popup full card
 * viewer and a contextual menu there. i didn't even know i had to
 * scroll down." The website's viewer (src/components/cards/) in the
 * website's order:
 *
 * - "Page 4" and nine dots on a pocket; NOT_SURE and the reader's note
 *   at the top when it was not sure.
 * - "Your photo" beside "Our match", the card's name and number under
 *   the match, and the note there when the reader was sure.
 * - "That's it", then "Other printing" (the printings in a small panel),
 *   "Not this card" (the other guesses, then "Find the card": the Flare
 *   picker itself, src/card-select.tsx, the read name typed, where a tap
 *   chooses the card and closes it), and "Leave empty" on a pocket.
 * - A pocket the reader could not place but the catalogue has guesses
 *   for: "Might be one of these" and those cards under the photo, a tap
 *   choosing one the way a found pocket's other guesses do.
 * - On a page, a swipe left or right is the next or previous pocket,
 *   across every page; "That's it" moves on by itself (the check's
 *   doing, src/page-scanner.tsx).
 */

/** The card a photo is taken to be, and which printing of it. */
export interface ViewerPick {
  hit: CardHit;
  printingId: string | null;
}

/** One photo in the viewer: a single scan's, or one pocket of a page. */
export interface ViewerPocket {
  key: string;
  /** For a pocket: its binder page and slot, the heading and the dots. */
  page?: number;
  slot?: number;
  /** The player's own photo of the card. */
  photo: string | null;
  state: "found" | "unread" | "empty";
  pick: ViewerPick | null;
  /** The reader's guesses, best first. */
  matches: ScanMatch[];
  /** The careful reader's confidence; absent from a quick read. */
  sure?: boolean;
  /** How it decided, in a few words. */
  note?: string;
  /**
   * For an unread pocket: the catalogue's closest cards to what the
   * reader saw, shown as "Might be one of these".
   */
  suggestions?: ScanMatch[];
  /** The name read off the card, typed into "Find the card". */
  lookFor: string;
  /** The pocket already holds a card in this binder. */
  taken?: boolean;
}

/** The art a pick shows: its printing's, else the card's lead art. */
export function pickArt(pick: ViewerPick): string | null {
  return (
    pick.hit.printings.find((printing) => printing.id === pick.printingId)?.imageUrl ??
    leadArt(pick.hit)
  );
}

type Panel = "printing" | "others";

export function CardViewer({
  pockets,
  index,
  onIndex,
  onPick,
  onConfirm,
  onLeaveEmpty,
  onClose,
}: {
  pockets: ViewerPocket[];
  index: number;
  /** Swiped to another pocket. */
  onIndex: (index: number) => void;
  /** Another guess, another printing, or a card found by hand. */
  onPick: (index: number, pick: ViewerPick) => void;
  /** "That's it". */
  onConfirm: (index: number) => void;
  /** "Leave empty": a pocket of a page only. */
  onLeaveEmpty?: (index: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const list = useRef<FlatList<ViewerPocket>>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  /* "Find the card": the words for the picker's search while it is open. */
  const [finding, setFinding] = useState<{ text: string } | null>(null);
  /* The pager's own height, so each pocket scrolls inside it. */
  const [tall, setTall] = useState(0);
  /* The pocket the pager is on, so a swipe and a move from outside
     never chase each other. */
  const shown = useRef(index);

  useEffect(() => {
    setPanel(null);
    setFinding(null);
    if (shown.current === index) return;
    shown.current = index;
    list.current?.scrollToIndex({ index, animated: true });
  }, [index]);

  const pocket = pockets[index];
  if (!pocket) return null;
  const pick = pocket.pick;
  const width = window.width;
  const others = pocket.matches.filter((match) => match.card.id !== pick?.hit.id);
  const choose = (next: ViewerPick) => {
    setPanel(null);
    onPick(index, next);
  };
  /* The Flare picker over the viewer, the read name typed. */
  const find = () => {
    setPanel(null);
    setFinding({ text: pocket.lookFor });
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: insets.top + spacing(2),
        paddingBottom: insets.bottom + spacing(3),
      }}
    >
      <View style={styles.top}>
        <View style={{ flex: 1, gap: spacing(1.5) }}>
          {pocket.page !== undefined ? (
            <Text accessibilityRole="header" style={styles.heading}>
              {`Page ${pocket.page}`}
            </Text>
          ) : null}
          {pocket.slot !== undefined ? <Dots slot={pocket.slot} /> : null}
        </View>
        <SheetClose onPress={onClose} />
      </View>

      <FlatList
        ref={list}
        data={pockets}
        keyExtractor={(each) => each.key}
        horizontal
        pagingEnabled
        scrollEnabled={pockets.length > 1}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
        onMomentumScrollEnd={(event) => {
          const at = Math.round(event.nativeEvent.contentOffset.x / width);
          if (at === shown.current || at < 0 || at >= pockets.length) return;
          shown.current = at;
          onIndex(at);
        }}
        onLayout={(event) => setTall(event.nativeEvent.layout.height)}
        extraData={`${width}x${tall}`}
        renderItem={({ item, index: at }) => (
          <Pane
            pocket={item}
            width={width}
            height={tall > 0 ? tall : undefined}
            onChoose={(next) => onPick(at, next)}
          />
        )}
        style={{ flex: 1 }}
      />

      {/* The menu, in the website's order. A button with nothing to do
          is not drawn: no printings to choose, no card to leave out.
          "That's it" on an empty pocket says it is empty. */}
      <View style={styles.actions}>
        {pick || pocket.state === "empty" ? (
          <Button label={THATS_IT} onPress={() => onConfirm(index)} />
        ) : null}
        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          {pick && pick.hit.printings.length > 1 ? (
            <Pill label={OTHER_PRINTING} onPress={() => setPanel("printing")} />
          ) : null}
          {pick ? (
            <Pill label={NOT_THIS_CARD} onPress={() => setPanel("others")} />
          ) : (
            <Pill label={FIND_THE_CARD} onPress={find} />
          )}
          {onLeaveEmpty && pick ? (
            <Pill label={LEAVE_EMPTY} onPress={() => onLeaveEmpty(index)} />
          ) : null}
        </View>
      </View>

      {panel ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            onPress={() => setPanel(null)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ flex: 1, backgroundColor: colors.scrim }}
          />
          <View style={[styles.panel, { paddingBottom: insets.bottom + spacing(3) }]}>
            <View style={styles.panelTop}>
              <Text accessibilityRole="header" style={styles.heading}>
                {panel === "printing" ? OTHER_PRINTING : NOT_THIS_CARD}
              </Text>
              <SheetClose onPress={() => setPanel(null)} />
            </View>

            {panel === "printing" && pick ? (
              <PrintingChips
                printings={pick.hit.printings}
                value={pick.printingId}
                onChange={(printingId) => choose({ ...pick, printingId })}
              />
            ) : null}

            {panel === "others" ? (
              <View style={{ gap: spacing(3) }}>
                {others.length > 0 ? (
                  <View style={{ gap: spacing(2) }}>
                    <Text style={styles.small}>{OTHER_MATCHES}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: spacing(2) }}
                    >
                      {others.map((match) => {
                        const other = scanHit(match.card, match.printingId);
                        return (
                          <Tap
                            key={match.card.id}
                            onPress={() =>
                              choose({ hit: other, printingId: match.printingId })
                            }
                            accessibilityLabel={`${other.name}, ${other.cardNumber}`}
                            style={{ width: 72, gap: spacing(1) }}
                          >
                            <RemoteImage
                              uri={leadArt(other)}
                              contentFit="cover"
                              style={styles.otherArt}
                            />
                            <Text numberOfLines={1} style={styles.tiny}>
                              {other.cardNumber}
                            </Text>
                          </Tap>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                <Button label={FIND_THE_CARD} variant="secondary" onPress={find} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* "Find the card" is the Flare composer's picker, the same sheet,
          for one card: a tap chooses it and the sheet closes, no count.
          Headed "Find the card", as the website's is. Drawn inside the
          viewer, so on iOS it is presented from the viewer's own Modal
          and lands on top of it, as the scanner does over the binder's
          add menu. */}
      <CardSelectSheet
        visible={finding !== null}
        target={{ kind: "list" }}
        title={FIND_THE_CARD}
        onPickOne={(hit, printingId) => choose({ hit, printingId })}
        onClose={() => setFinding(null)}
        searchFor={finding}
      />
    </View>
  );
}

/** Nine dots, the pocket's own lit: where on its page this one sits. */
function Dots({ slot }: { slot: number }) {
  return (
    <View
      accessibilityLabel={`Pocket ${slot + 1} of ${POCKETS_PER_PAGE}`}
      style={{ flexDirection: "row", gap: spacing(1.5) }}
    >
      {Array.from({ length: POCKETS_PER_PAGE }, (_, at) => (
        <View
          key={at}
          style={[styles.dot, at === slot && { backgroundColor: colors.accent }]}
        />
      ))}
    </View>
  );
}

/** One photo and its match, side by side, with what was read about it. */
function Pane({
  pocket,
  width,
  height: tall,
  onChoose,
}: {
  pocket: ViewerPocket;
  width: number;
  height?: number;
  /** One of "Might be one of these" tapped. */
  onChoose: (pick: ViewerPick) => void;
}) {
  const column = Math.floor((width - 2 * gutter - spacing(3)) / 2);
  const height = Math.round((column * 88) / 63);
  const pick = pocket.pick;
  const art = pick ? pickArt(pick) : null;
  const unsure = pocket.state === "found" && pocket.sure === false;
  const note = (pocket.note ?? "").trim();
  const frame = { width: column, height, borderRadius: radius.control / 2 };
  const suggestions = pocket.state === "unread" ? (pocket.suggestions ?? []) : [];

  return (
    <ScrollView
      style={{ width, height: tall }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(3),
        gap: spacing(3),
      }}
    >
      {unsure ? (
        <View style={styles.flag}>
          <Ionicons name="help-circle" size={16} color={colors.warning} />
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={styles.unsure}>{NOT_SURE}</Text>
            {note ? <Text style={styles.line}>{note}</Text> : null}
          </View>
        </View>
      ) : null}
      {pocket.taken ? (
        <View style={styles.flag}>
          <Ionicons name="alert-circle" size={16} color={colors.warning} />
          <Text style={[styles.line, { flex: 1 }]}>{POCKET_TAKEN}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing(3) }}>
        <View style={{ width: column, gap: spacing(1.5) }}>
          <Text style={styles.label}>{YOUR_PHOTO}</Text>
          {pocket.photo ? (
            <Image
              source={{ uri: pocket.photo }}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              style={[frame, styles.photo]}
            />
          ) : (
            <View style={[frame, styles.empty]} />
          )}
        </View>
        <View style={{ width: column, gap: spacing(1.5) }}>
          <Text style={styles.label}>{OUR_MATCH}</Text>
          {pick ? (
            <RemoteImage
              uri={art}
              contentFit="cover"
              accessibilityLabel={`${pick.hit.name}, ${pick.hit.cardNumber}`}
              style={[frame, { backgroundColor: colors.elevated }]}
            />
          ) : (
            <View style={[frame, styles.empty]}>
              {pocket.state === "unread" ? (
                <Text style={styles.unknown}>?</Text>
              ) : (
                <Text style={styles.small}>{POCKET_EMPTY}</Text>
              )}
            </View>
          )}
          {pick ? (
            <View style={{ gap: spacing(0.5) }}>
              <Text style={styles.name}>{pick.hit.name}</Text>
              <Text style={styles.number}>{pick.hit.cardNumber}</Text>
            </View>
          ) : pocket.state === "unread" ? (
            <Text style={styles.line}>{POCKET_UNREAD}</Text>
          ) : null}
          {!unsure && note ? <Text style={styles.line}>{note}</Text> : null}
        </View>
      </View>

      {/* What it might be, when the reader could not place it: each a
          tap to choose, as a found pocket's other guesses are. A plain
          wrapping row, not a scroller, so a swipe is still the pager's. */}
      {suggestions.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Text accessibilityRole="header" style={styles.label}>
            {MIGHT_BE_THESE}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
            {suggestions.map((match) => {
              const maybe = scanHit(match.card, match.printingId);
              const on = pick?.hit.id === maybe.id;
              return (
                <Tap
                  key={match.card.id}
                  onPress={() => onChoose({ hit: maybe, printingId: match.printingId })}
                  accessibilityLabel={`${maybe.name}, ${maybe.cardNumber}`}
                  accessibilityState={{ selected: on }}
                  style={{ width: 72, gap: spacing(1) }}
                >
                  <RemoteImage
                    uri={leadArt(maybe)}
                    contentFit="cover"
                    style={[styles.otherArt, on && { borderColor: colors.accent }]}
                  />
                  <Text numberOfLines={1} style={styles.tinyName}>
                    {maybe.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.tiny}>
                    {maybe.cardNumber}
                  </Text>
                </Tap>
              );
            })}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/** One of the menu's smaller actions, side by side under "That's it". */
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} style={styles.pill}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.pillLabel}>
        {label}
      </Text>
    </Tap>
  );
}

/**
 * Which printing: "Any printing" and every version as a chip, the one
 * the set code named already on. The single scan's and a pocket's, the
 * same chips.
 */
export function PrintingChips({
  printings,
  value,
  onChange,
}: {
  printings: { id: string; label: string | null }[];
  value: string | null;
  onChange: (printingId: string | null) => void;
}) {
  return (
    <View
      accessibilityLabel="Printing"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}
    >
      {[null, ...printings].map((printing) => {
        const id = printing?.id ?? null;
        const on = id === value;
        const label = printing
          ? (printing.label ?? "Standard printing")
          : "Any printing";
        return (
          <Tap
            key={id ?? "any"}
            onPress={() => onChange(id)}
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={{
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
              backgroundColor: on ? colors.accent : "transparent",
              borderRadius: 999,
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(1.5),
            }}
          >
            <Text
              style={{
                color: on ? colors.accentContrast : colors.textSecondary,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing(2),
    paddingHorizontal: gutter,
    minHeight: 24,
  },
  actions: { gap: spacing(2), paddingHorizontal: gutter, paddingTop: spacing(2) },
  pill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  panel: {
    gap: spacing(3),
    paddingTop: spacing(4),
    paddingHorizontal: gutter,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  flag: { flexDirection: "row", alignItems: "flex-start", gap: spacing(1.5) },
  photo: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  empty: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  otherArt: {
    width: 72,
    height: 100,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  number: { color: colors.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
  line: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  unsure: { color: colors.warning, fontSize: 13, fontWeight: "600" },
  unknown: { color: colors.textSecondary, fontSize: 28, fontWeight: "600" },
  small: { color: colors.textMuted, fontSize: 12 },
  tiny: { color: colors.textMuted, fontSize: 10 },
  tinyName: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
});
