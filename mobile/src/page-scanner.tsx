import { Ionicons } from "@expo/vector-icons";
import { CameraView } from "expo-camera";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  type Binder,
  type CardHit,
  type PocketOutcome,
  describeError,
  friendlyError,
  placeBinderPages,
  scanPagePhotos,
  serverMessage,
} from "./api";
import { CameraAllowed, PrintingChips } from "./card-scanner";
import { useCardSearch } from "./card-select";
import { leadArt } from "./flare-bits";
import { GameSearchField } from "./game-chips";
import { searchPlaceholder } from "./game-scope";
import {
  canTakeAnother,
  lastStartPage,
  nextToRead,
  pageCells,
  pageCounts,
  pageFrame,
  pagePlacements,
  pagesWithCards,
  pocketInPhoto,
  type PageStatus,
  type PocketChoice,
} from "./page-scan";
import { RemoteImage } from "./remote-image";
import {
  BACK_TO_PAGES,
  CHECK_PAGES,
  FIND_THE_CARD,
  IS_THIS_IT,
  LEAVE_EMPTY,
  OTHER_MATCHES,
  PAGE_FAILED,
  PAGES_HINT,
  POCKET_EMPTY,
  POCKET_TAKEN,
  POCKET_UNREAD,
  POCKETS_PER_PAGE,
  READING_PAGE,
  REMOVE_PAGE,
  RETAKE,
  SCAN_MAX_BYTES,
  SCAN_REFUSALS,
  START_EARLIER,
  START_LATER,
  addPagesLabel,
  firstEmptyPage,
  pageStatusLine,
  pocketAt,
  startingAtLine,
  takePageLabel,
} from "./scan-copy";
import { frameInPhoto, scanResize } from "./scan-frame";
import { scanHit } from "./scan-hit";
import { Stepper } from "./stepper";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, ErrorLine, Loading, Muted, Tap } from "./ui";

/**
 * Whole binder pages into a queue, then into the binder, pocket for
 * pocket. The founder (2026-10-09): "would be cool if someone could
 * scan, let's say 5 pages of their binder into a queue and it auto
 * fills in an actual binder, with the exact same location the cards
 * were in in their binder, placed into a cardflare binder."
 *
 * The website's steps in the website's order:
 *
 * a. "Starting at page 4", a minus and a plus, the hint, then the
 *    camera with a page-shaped guide (three card-shaped cells across,
 *    three down) and the shutter, "Take page 4".
 * b. Each photo is cut to the guide and into its nine pockets, each
 *    shrunk to a card's size, and joins the queue. Pages go up one at a
 *    time in queue order while the player keeps shooting; each row says
 *    "Reading...", then "Page 4 · 8 of 9 read", or why it did not read,
 *    with "Retake". Every row can be removed, and the pages after it
 *    move up a number.
 * c. "Check the pages": every page as its 3x3 grid, "Back to pages" over
 *    it for another photo. A pocket opens under its page: the player's
 *    own photo of it, the guess and the others, the printing, "Find the
 *    card" for one the reader missed, "Leave empty" for any.
 * d. "Add 5 pages to binder" places each chosen card in the pocket it
 *    sat in. Nothing goes in the tray, and nothing is placed before the
 *    player has looked.
 */

/** A pocket's card, as the player has it now. */
interface PocketPick {
  hit: CardHit;
  printingId: string | null;
}

/** A page in the queue. */
interface QueuedPage {
  id: string;
  /** The page as shot, cut to the guide, small: the row's thumbnail. */
  thumb: string;
  /** Each pocket's photo, kept for the check; its base64 until it has gone up. */
  cells: { uri: string; data: string | null }[];
  status: PageStatus;
  /** The nine pockets, by slot, once read. */
  pockets: PocketOutcome[];
  /** The card each pocket will be placed with; null leaves it empty. */
  picks: (PocketPick | null)[];
  /** Why it did not read, in words. */
  failure: string | null;
}

/** Pockets cut at the single scan's quality, walking down only past the ceiling. */
async function cutPocket(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<{ uri: string; data: string | null }> {
  let quality = 0.6;
  let last = "";
  while (quality >= 0.3) {
    const out = await manipulateAsync(uri, [{ crop }, { resize: scanResize(crop) }], {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    last = out.uri;
    if (out.base64 && (out.base64.length * 3) / 4 <= SCAN_MAX_BYTES) {
      return { uri: out.uri, data: out.base64 };
    }
    quality -= 0.15;
  }
  return { uri: last, data: null };
}

/**
 * The guide's part of the photo, through the preview's fit and with no
 * margin of its own, then its nine pockets, each the website's
 * pocketCrop of that part, shrunk to SCAN_LONG_EDGE.
 */
async function cutPage(
  photo: { uri: string; width: number; height: number },
  view: { width: number; height: number },
): Promise<Pick<QueuedPage, "thumb" | "cells">> {
  const region = frameInPhoto(pageFrame(view.width, view.height), view, photo, 0);
  const [thumb, ...cells] = await Promise.all([
    manipulateAsync(photo.uri, [{ crop: region }, { resize: { width: 120 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
    }).then((out) => ({ uri: out.uri, data: null })),
    ...Array.from({ length: POCKETS_PER_PAGE }, (_, slot) =>
      cutPocket(photo.uri, pocketInPhoto(slot, region)),
    ),
  ]);
  return { thumb: thumb.uri, cells };
}

/** The guess a found pocket starts with; nothing for any other. */
function firstPick(pocket: PocketOutcome): PocketPick | null {
  if (pocket.state !== "found") return null;
  const top = pocket.matches[0];
  return top
    ? { hit: scanHit(top.card, top.printingId), printingId: top.printingId }
    : null;
}

/** A read page, its pockets in slot order and each one's first pick. */
async function readPage(
  cells: (string | null)[],
): Promise<Pick<QueuedPage, "status" | "pockets" | "picks" | "failure">> {
  try {
    const outcome = await scanPagePhotos(cells);
    if (!outcome.ok) {
      return {
        status: "failed",
        pockets: [],
        picks: [],
        failure: SCAN_REFUSALS[outcome.reason],
      };
    }
    const pockets = Array.from(
      { length: POCKETS_PER_PAGE },
      (_, slot): PocketOutcome =>
        outcome.pockets.find((pocket) => pocket.slot === slot) ?? {
          slot,
          state: "empty",
        },
    );
    return { status: "read", pockets, picks: pockets.map(firstPick), failure: null };
  } catch (caught) {
    console.warn("[cardflare] page scan failed", describeError(caught));
    return { status: "failed", pockets: [], picks: [], failure: PAGE_FAILED };
  }
}

/** A queued page's row, in words. */
function rowLine(page: QueuedPage, number: number): string {
  if (page.status === "failed") return page.failure ?? PAGE_FAILED;
  if (page.status !== "read") return READING_PAGE;
  const { found, cards } = pageCounts(page.pockets);
  return pageStatusLine(number, found, cards);
}

/** The art a pick shows: its printing's, else the card's lead art. */
function pickArt(pick: PocketPick): string | null {
  return (
    pick.hit.printings.find((printing) => printing.id === pick.printingId)?.imageUrl ??
    leadArt(pick.hit)
  );
}

let shots = 0;

export function PageScanner({
  binderId,
  occupied,
  onPlaced,
}: {
  binderId: string;
  /** The pockets this binder already has a card in. */
  occupied: number[];
  /** The server's answer, for the menu to show and refresh with, as the tray's Add. */
  onPlaced: (added: {
    binder: Binder;
    message: string;
    firstPocket: number | null;
  }) => void;
}) {
  const window = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [step, setStep] = useState<"shoot" | "check">("shoot");
  const [start, setStart] = useState(() => firstEmptyPage(occupied));
  const [queue, setQueue] = useState<QueuedPage[]>([]);
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; slot: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  /* The page on its way up, if any: one at a time, whatever the queue does. */
  const reading = useRef<string | null>(null);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const taken = new Set(occupied);

  /* Pages go up one at a time, in queue order, while the player keeps
     shooting. Each answer changes the queue, which brings this round
     again for the next page waiting. */
  useEffect(() => {
    if (reading.current) return;
    const at = nextToRead(queue);
    if (at < 0) return;
    const page = queue[at];
    reading.current = page.id;
    setQueue((current) =>
      current.map((each) =>
        each.id === page.id ? { ...each, status: "reading" } : each,
      ),
    );
    void readPage(page.cells.map((cell) => cell.data)).then((result) => {
      reading.current = null;
      if (!alive.current) return;
      /* A page removed while it was reading is simply gone. Its base64
         is dropped once sent; the photos stay for the check. */
      setQueue((current) =>
        current.map((each) =>
          each.id === page.id
            ? {
                ...each,
                ...result,
                cells: each.cells.map((cell) => ({ ...cell, data: null })),
              }
            : each,
        ),
      );
    });
  }, [queue]);

  const retakeAt = retakeId ? queue.findIndex((page) => page.id === retakeId) : -1;
  const nextNumber = retakeAt >= 0 ? start + retakeAt : start + queue.length;
  const canShoot = retakeAt >= 0 || canTakeAnother(start, queue.length);

  const shoot = async () => {
    if (!camera.current || !view || capturing || !canShoot) return;
    const replacing = retakeAt >= 0 ? retakeId : null;
    setCapturing(true);
    setShotError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!alive.current) return;
      const cut = await cutPage(photo, view);
      if (!alive.current) return;
      shots += 1;
      const page: QueuedPage = {
        id: `page-${shots}`,
        ...cut,
        status: "waiting",
        pockets: [],
        picks: [],
        failure: null,
      };
      setQueue((current) =>
        replacing && current.some((each) => each.id === replacing)
          ? current.map((each) => (each.id === replacing ? page : each))
          : [...current, page],
      );
      setRetakeId(null);
    } catch (caught) {
      console.warn("[cardflare] page photo failed", describeError(caught));
      if (alive.current) setShotError(PAGE_FAILED);
    } finally {
      if (alive.current) setCapturing(false);
    }
  };

  const remove = (id: string) => {
    setQueue((current) => current.filter((page) => page.id !== id));
    if (retakeId === id) setRetakeId(null);
    if (open?.id === id) setOpen(null);
  };

  const choose = (id: string, slot: number, pick: PocketPick | null) =>
    setQueue((current) =>
      current.map((page) =>
        page.id === id
          ? {
              ...page,
              picks: page.picks.map((each, at) => (at === slot ? pick : each)),
            }
          : page,
      ),
    );

  const choices = queue.map((page): PocketChoice[] =>
    page.status === "read"
      ? page.picks.map((pick) =>
          pick ? { cardId: pick.hit.id, printingId: pick.printingId } : null,
        )
      : [],
  );
  const chosenPages = pagesWithCards(choices);

  const place = async () => {
    if (busy) return;
    const placements = pagePlacements(start, choices);
    if (placements.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await placeBinderPages(binderId, placements);
      if (alive.current) onPlaced(result);
    } catch (caught) {
      if (alive.current) {
        setError(
          serverMessage(caught) ?? `That did not save. ${friendlyError(caught)}`,
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (step === "check") {
    /* Three across, measured off the window, as the pasted list's grid. */
    const tile = Math.floor((window.width - 2 * gutter - 2 * spacing(2)) / 3);
    return (
      <View style={{ flex: 1, gap: spacing(2), paddingBottom: spacing(2) }}>
        {/* Back to the camera for another page, the queue as it was. */}
        <Button
          label={BACK_TO_PAGES}
          variant="secondary"
          onPress={() => {
            setOpen(null);
            setStep("shoot");
          }}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: spacing(5), paddingBottom: spacing(4) }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {queue.map((page, index) => {
            const number = start + index;
            const openSlot = open?.id === page.id ? open.slot : null;
            return (
              <View key={page.id} style={{ gap: spacing(3) }}>
                <Text accessibilityRole="header" style={styles.heading}>
                  {`Page ${number}`}
                </Text>
                {page.status === "read" ? (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: spacing(2),
                      }}
                    >
                      {page.pockets.map((pocket) => (
                        <PocketTile
                          key={pocket.slot}
                          pocket={pocket}
                          pick={page.picks[pocket.slot] ?? null}
                          photo={page.cells[pocket.slot]?.uri ?? null}
                          taken={taken.has(pocketAt(number, pocket.slot))}
                          open={openSlot === pocket.slot}
                          width={tile}
                          onPress={() =>
                            setOpen(
                              openSlot === pocket.slot
                                ? null
                                : { id: page.id, slot: pocket.slot },
                            )
                          }
                        />
                      ))}
                    </View>
                    {openSlot !== null && page.pockets[openSlot] ? (
                      <PocketDetail
                        key={`${page.id}:${openSlot}`}
                        pocket={page.pockets[openSlot]}
                        pick={page.picks[openSlot] ?? null}
                        photo={page.cells[openSlot]?.uri ?? null}
                        taken={taken.has(pocketAt(number, openSlot))}
                        onChoose={(pick) => choose(page.id, openSlot, pick)}
                        onLeaveEmpty={() => {
                          choose(page.id, openSlot, null);
                          setOpen(null);
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.line}>{rowLine(page, number)}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
        <ErrorLine message={error} />
        <Button
          label={addPagesLabel(chosenPages)}
          busy={busy}
          disabled={chosenPages === 0}
          onPress={() => void place()}
        />
      </View>
    );
  }

  const frame = view ? pageFrame(view.width, view.height) : null;
  const anyRead = queue.some((page) => page.status === "read");
  return (
    <View style={{ flex: 1, gap: spacing(3), paddingBottom: spacing(3) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Text style={styles.heading}>{startingAtLine(start)}</Text>
        <Stepper
          value={start}
          min={1}
          max={lastStartPage(queue.length)}
          label="page number"
          lessLabel={START_EARLIER}
          moreLabel={START_LATER}
          onChange={setStart}
        />
      </View>
      <Muted>{PAGES_HINT}</Muted>

      <CameraAllowed>
        <View style={{ flex: 1, gap: spacing(3) }}>
          <View
            style={styles.viewfinder}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setView({ width, height });
            }}
          >
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            {frame
              ? pageCells(frame).map((cell, slot) => (
                  <View
                    key={slot}
                    pointerEvents="none"
                    style={[
                      styles.cell,
                      {
                        left: cell.x,
                        top: cell.y,
                        width: cell.width,
                        height: cell.height,
                      },
                    ]}
                  />
                ))
              : null}
          </View>
          <Button
            label={takePageLabel(nextNumber)}
            busy={capturing}
            disabled={!view || !canShoot}
            onPress={() => void shoot()}
          />
          <ErrorLine message={shotError} />
        </View>
      </CameraAllowed>

      {queue.length > 0 ? (
        <ScrollView
          style={{ maxHeight: 180, flexGrow: 0 }}
          contentContainerStyle={{ gap: spacing(2) }}
        >
          {queue.map((page, index) => (
            <View
              key={page.id}
              style={[
                styles.row,
                page.id === retakeId && { borderColor: colors.accent },
              ]}
            >
              <Image
                source={{ uri: page.thumb }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
                style={styles.thumb}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.line, { flex: 1 }]}
                numberOfLines={2}
              >
                {rowLine(page, start + index)}
              </Text>
              {page.status === "failed" ? (
                <Tap
                  onPress={() => setRetakeId(page.id === retakeId ? null : page.id)}
                  accessibilityLabel={`${RETAKE} page ${start + index}`}
                  accessibilityState={{ selected: page.id === retakeId }}
                  hitSlop={8}
                >
                  <Text style={styles.action}>{RETAKE}</Text>
                </Tap>
              ) : null}
              <Tap
                onPress={() => remove(page.id)}
                accessibilityLabel={`${REMOVE_PAGE} page ${start + index}`}
                hitSlop={8}
              >
                <Text style={styles.remove}>{REMOVE_PAGE}</Text>
              </Tap>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {anyRead ? <Button label={CHECK_PAGES} onPress={() => setStep("check")} /> : null}
    </View>
  );
}

/**
 * One pocket on the check grid. A chosen card shows its art, or the
 * player's own photo of the pocket when the card has none; an unread
 * pocket is a "?"; an empty one is faint. A plain border: the accent
 * outline means "you have this" elsewhere, and here a card is only a
 * guess until it is placed. A pocket already full in this binder wears
 * a small mark, and its detail says why.
 */
function PocketTile({
  pocket,
  pick,
  photo,
  taken,
  open,
  width,
  onPress,
}: {
  pocket: PocketOutcome;
  pick: PocketPick | null;
  photo: string | null;
  taken: boolean;
  open: boolean;
  width: number;
  onPress: () => void;
}) {
  const height = Math.round((width * 88) / 63);
  const art = pick ? (pickArt(pick) ?? photo) : null;
  const label = pick
    ? `Pocket ${pocket.slot + 1}: ${pick.hit.name}`
    : `Pocket ${pocket.slot + 1}: ${pocket.state === "unread" ? POCKET_UNREAD : POCKET_EMPTY}`;
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={{
        width,
        height,
        borderRadius: radius.control / 2,
        borderWidth: 1,
        borderColor: open ? colors.textSecondary : colors.border,
        backgroundColor:
          pick || pocket.state === "unread" ? colors.elevated : colors.canvas,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {pick ? (
        art ? (
          <RemoteImage uri={art} contentFit="cover" style={{ width, height }} />
        ) : (
          <Text numberOfLines={4} style={styles.tileName}>
            {pick.hit.name}
          </Text>
        )
      ) : pocket.state === "unread" ? (
        <Text style={styles.unknown}>?</Text>
      ) : (
        <Text style={styles.small}>{POCKET_EMPTY}</Text>
      )}
      {taken ? (
        <View style={styles.takenMark}>
          <Ionicons name="alert-circle" size={14} color={colors.warning} />
        </View>
      ) : null}
    </Tap>
  );
}

/**
 * What was read in one pocket, under its page's grid: the player's own
 * photo beside the card it will be placed with, the other guesses and
 * the printings for a found pocket, the search for one that was not
 * found, and "Leave empty" on every one.
 */
function PocketDetail({
  pocket,
  pick,
  photo,
  taken,
  onChoose,
  onLeaveEmpty,
}: {
  pocket: PocketOutcome;
  pick: PocketPick | null;
  photo: string | null;
  taken: boolean;
  onChoose: (pick: PocketPick) => void;
  onLeaveEmpty: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const read = pocket.state === "empty" ? null : pocket.read;
  const lookFor = read ? read.englishName || read.name : "";
  const matches = pocket.state === "found" ? pocket.matches : [];
  const others = matches.filter((match) => match.card.id !== pick?.hit.id);
  const art = pick ? pickArt(pick) : null;

  return (
    <View style={styles.detail}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={styles.photo}
          />
        ) : null}
        <View style={{ flex: 1, gap: spacing(2) }}>
          {taken ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing(1.5),
              }}
            >
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <Text style={[styles.line, { flex: 1 }]}>{POCKET_TAKEN}</Text>
            </View>
          ) : null}
          {pocket.state === "unread" && !pick ? (
            <Text style={styles.body}>{POCKET_UNREAD}</Text>
          ) : null}
        </View>
      </View>

      {pocket.state === "found" ? (
        <Text accessibilityRole="header" style={styles.heading}>
          {IS_THIS_IT}
        </Text>
      ) : null}
      {pick ? (
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}
        >
          <RemoteImage
            uri={art}
            contentFit="cover"
            accessibilityLabel={`${pick.hit.name}, ${pick.hit.cardNumber}`}
            style={{
              width: 112,
              height: Math.round((112 * 88) / 63),
              borderRadius: 6,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={styles.name}>{pick.hit.name}</Text>
            <Text style={styles.number}>{pick.hit.cardNumber}</Text>
          </View>
        </View>
      ) : null}

      {others.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          {pick ? <Text style={styles.small}>{OTHER_MATCHES}</Text> : null}
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
                  onPress={() => onChoose({ hit: other, printingId: match.printingId })}
                  accessibilityLabel={`${other.name}, ${other.cardNumber}`}
                  style={{ width: 60, gap: spacing(1) }}
                >
                  <RemoteImage
                    uri={leadArt(other)}
                    contentFit="cover"
                    style={{
                      width: 60,
                      height: 84,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                    }}
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

      {pick && pick.hit.printings.length > 1 ? (
        <PrintingChips
          printings={pick.hit.printings}
          value={pick.printingId}
          onChange={(printingId) => onChoose({ ...pick, printingId })}
        />
      ) : null}

      {/* A pocket with no guess is found by hand, the read name already
          typed when there is one. */}
      {pocket.state !== "found" ? (
        searching ? (
          <PocketSearch
            initial={lookFor}
            onPick={(hit) => {
              onChoose({ hit, printingId: null });
              setSearching(false);
            }}
          />
        ) : (
          <Button
            label={FIND_THE_CARD}
            variant="secondary"
            onPress={() => setSearching(true)}
          />
        )
      ) : null}

      <Button label={LEAVE_EMPTY} variant="secondary" onPress={onLeaveEmpty} />
    </View>
  );
}

/**
 * The picker's own search (src/card-select.tsx's useCardSearch and its
 * game field), for one card: a tap chooses it for the pocket, any
 * printing, and the printing chips above narrow it.
 */
function PocketSearch({
  initial,
  onPick,
}: {
  initial: string;
  onPick: (hit: CardHit) => void;
}) {
  const search = useCardSearch({ kind: "list" });
  const { setQuery } = search;

  useEffect(() => {
    if (initial) setQuery(initial);
  }, [initial, setQuery]);

  return (
    <View style={{ gap: spacing(2) }}>
      <GameSearchField
        scope={search.scope}
        playerGames={search.playerGames}
        onPick={search.pickGame}
        value={search.query}
        onChangeText={search.setQuery}
        placeholder={searchPlaceholder(search.scopedGame)}
        autoFocus
      />
      {search.searching && search.hits.length === 0 ? <Loading /> : null}
      {search.hits.map((hit) => (
        <Tap
          key={hit.id}
          onPress={() => onPick(hit)}
          accessibilityLabel={`${hit.name}, ${hit.cardNumber}`}
          style={styles.hit}
        >
          <RemoteImage
            uri={leadArt(hit)}
            contentFit="cover"
            style={{
              width: 36,
              height: 50,
              borderRadius: 4,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontWeight: "700" }}
            >
              {hit.name}
            </Text>
            <Text style={styles.small}>{hit.cardNumber}</Text>
          </View>
        </Tap>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    flex: 1,
    minHeight: 220,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  cell: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.control / 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    padding: spacing(2),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 36,
    height: 50,
    borderRadius: 4,
    backgroundColor: colors.elevated,
  },
  detail: {
    gap: spacing(4),
    padding: spacing(3),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
  },
  photo: {
    width: 80,
    height: Math.round((80 * 88) / 63),
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    padding: spacing(2),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  takenMark: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 999,
    padding: 1,
    backgroundColor: colors.scrim,
  },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  body: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  line: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  action: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  remove: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
  number: { color: colors.textMuted, fontSize: 14, fontVariant: ["tabular-nums"] },
  tileName: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  unknown: { color: colors.textSecondary, fontSize: 24, fontWeight: "600" },
  small: { color: colors.textMuted, fontSize: 12 },
  tiny: { color: colors.textMuted, fontSize: 10 },
});
