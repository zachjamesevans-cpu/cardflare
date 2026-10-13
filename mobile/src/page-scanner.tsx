import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ApiError,
  type PlaceMode,
  type PlaceResume,
  type PocketOutcome,
  type QueuedPage,
  discardPageQueue,
  friendlyError,
  getPageQueue,
  placePageQueue,
  placedAny,
  realignPage,
  rescanPagePocket,
  serverMessage,
} from "./api";
import { CardScanner } from "./card-scanner";
import { CardViewer, pickArt, type ViewerPick, type ViewerPocket } from "./card-viewer";
import { PageAlignSheet } from "./page-align";
import type { Quad } from "./page-geometry";
import {
  STATUS_TOKEN,
  needsLook,
  pagePlacements,
  pagesWithCards,
  pocketName,
  queueSettled,
  pocketStatus,
  statusWord,
  type PocketChoice,
} from "./page-scan";
import { RemoteImage } from "./remote-image";
import {
  BLURRY_PAGE,
  CANCEL_PLACING,
  CHECK_PAGES,
  LINE_UP_PAGE,
  MOVE_AND_PLACE,
  NOT_SURE,
  PAGE_FAILED,
  PAGE_NEEDS_LINING_UP,
  PAGE_TOOK_TOO_LONG,
  POCKET_EMPTY,
  POCKET_UNREAD,
  POCKETS_PER_PAGE,
  READING_PAGE,
  RETAKE,
  SCAN_AGAIN,
  THROW_PAGES_AWAY,
  addPagesLabel,
  checkUnsureLabel,
  pagesPlacedLine,
  pocketAt,
} from "./scan-copy";
import { scanHit } from "./scan-hit";
import { SwipeToClose } from "./sheet-swipe";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, ErrorLine, Loading, SheetClose, Tap, Title } from "./ui";

/**
 * The check of whole binder pages read in the background, then into the
 * binder, pocket for pocket. The founder (2026-10-09): "would be cool if
 * someone could scan, let's say 5 pages of their binder into a queue and
 * it auto fills in an actual binder", and, on checking them: "it should
 * just have a popup full card viewer and a contextual menu there. i
 * didn't even know i had to scroll down."
 *
 * Pages are shot and sent from the one scanner (src/card-scanner.tsx).
 * The website's check in the website's order:
 *
 * a. The binder says "Reading 5 pages..." and then "5 pages ready to
 *    check" with "Check now"; the notice opens the same check.
 * b. Every page as its 3x3 grid, each pocket named A1 to C3 and
 *    coloured by its status (matched green, check this one yellow, empty
 *    grey, can't identify red) with the status in a word, showing the
 *    card we matched (a "?" for one we could not read). A blurry photo
 *    says so over its grid. A tap on any pocket opens the card viewer
 *    (src/card-viewer.tsx) on it, where it can also be read again on its
 *    own, and a swipe walks every pocket of every page. "Check 2 unsure"
 *    walks only the doubtful ones. A page that did not read says so with
 *    "Retake", into the same queue; one the scanner could not find the
 *    pockets on (it never guesses) says so with "Line up the page"
 *    (src/page-align.tsx) as well.
 * c. "Add 5 pages to binder" places each chosen card in the pocket it
 *    sat in, on its page's own number. Nothing is placed before the
 *    player has looked, and nothing in the binder is overwritten without
 *    a yes: a pocket already holding a different card is asked about,
 *    "Move them and place" or "Cancel". "Throw these pages away" ends the
 *    queue with nothing placed.
 */

/** A read page's nine pockets in slot order, an empty one for any not sent back. */
function slotted(pockets: readonly PocketOutcome[]): PocketOutcome[] {
  return Array.from(
    { length: POCKETS_PER_PAGE },
    (_, slot): PocketOutcome =>
      pockets.find((pocket) => pocket.slot === slot) ?? { slot, state: "empty" },
  );
}

/** The guess a found pocket starts with; nothing for any other. */
function firstPick(pocket: PocketOutcome): ViewerPick | null {
  if (pocket.state !== "found") return null;
  const top = pocket.matches[0];
  return top
    ? { hit: scanHit(top.card, top.printingId), printingId: top.printingId }
    : null;
}

/**
 * The check, in its own sheet over the binder: opened from the binder's
 * "Check now" or from the notice. Closed while `batchId` is null.
 */
export function PageCheckSheet({
  batchId,
  binderId,
  occupied,
  onClose,
  onPlaced,
}: {
  batchId: string | null;
  binderId: string;
  /** The pockets this binder already has a card in. */
  occupied: number[];
  /** Closed, thrown away, or gone already: the binder reads its queues again. */
  onClose: () => void;
  /** Placed: the server's sentence, for the binder to show as it refreshes. */
  onPlaced: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={batchId !== null} animationType="slide" onRequestClose={onClose}>
      <SwipeToClose
        onClose={onClose}
        pullZone={insets.top + spacing(3) + 40}
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: insets.top + spacing(3),
          paddingBottom: insets.bottom,
          paddingHorizontal: gutter,
          gap: spacing(3),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing(2),
          }}
        >
          <Title>{CHECK_PAGES}</Title>
          <SheetClose onPress={onClose} />
        </View>
        {batchId ? (
          <PageCheck
            key={batchId}
            batchId={batchId}
            binderId={binderId}
            occupied={occupied}
            onGone={onClose}
            onPlaced={onPlaced}
          />
        ) : null}
      </SwipeToClose>
    </Modal>
  );
}

/** How often a queue still being read is asked again, while its check is open. */
const CHECK_POLL_MS = 10_000;

/**
 * One queue's check: queueView from the server, every page as it
 * stands. A read page is the 3x3 grid of our matches; one still being
 * read says so and is asked again every ten seconds; one that failed
 * offers "Retake" into this queue.
 */
function PageCheck({
  batchId,
  binderId,
  occupied,
  onGone,
  onPlaced,
}: {
  batchId: string;
  binderId: string;
  occupied: number[];
  onGone: () => void;
  onPlaced: (message: string) => void;
}) {
  const window = useWindowDimensions();
  const [pages, setPages] = useState<QueuedPage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* Each read page's picks, by its scan: kept while the queue is asked
     again, made fresh when a retaken page reads again. */
  const [picks, setPicks] = useState<Record<string, (ViewerPick | null)[]>>({});
  /* Pockets the player has looked at in the viewer, by "scan:slot": a
     doubtful one stops being doubtful once it has been. */
  const [looked, setLooked] = useState<Record<string, true>>({});
  /* The viewer, open: the pockets it walks (all of them, or only the
     doubtful ones, fixed when it opens) and the one on screen. */
  const [walk, setWalk] = useState<{ keys: string[]; at: number } | null>(null);
  /* A failed page being shot again, by its number. */
  const [retaking, setRetaking] = useState<number | null>(null);
  /* A page being lined up by hand, by its scan. */
  const [aligning, setAligning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  /* Read at the moment it is needed, so a new function from the parent
     on every paint never asks the server again. */
  const gone = useRef(onGone);
  gone.current = onGone;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const queue = await getPageQueue(batchId);
      if (!alive.current) return;
      /* Placed or thrown away already (on the website, say): nothing to check. */
      if (!queue) {
        gone.current();
        return;
      }
      setPages(queue.pages);
      setLoadError(null);
      setPicks((current) =>
        Object.fromEntries(
          queue.pages.flatMap((page) =>
            page.status === "ready" && page.pockets
              ? [
                  [
                    page.scanId,
                    current[page.scanId] ?? slotted(page.pockets).map(firstPick),
                  ] as const,
                ]
              : [],
          ),
        ),
      );
    } catch (caught) {
      if (alive.current) setLoadError(friendlyError(caught));
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Asked again every ten seconds until every page is read or failed. */
  const settled = pages !== null && queueSettled(pages);
  useEffect(() => {
    if (pages === null || settled || retaking !== null || aligning !== null) return;
    const timer = setTimeout(() => void load(), CHECK_POLL_MS);
    return () => clearTimeout(timer);
  }, [pages, settled, retaking, aligning, load]);

  if (pages === null) {
    return loadError ? (
      <View style={{ gap: spacing(3) }}>
        <ErrorLine message={loadError} />
        <Button label={SCAN_AGAIN} variant="secondary" onPress={() => void load()} />
      </View>
    ) : (
      <Loading />
    );
  }

  const taken = new Set(occupied);

  /* Every pocket of every read page, in order, as the viewer draws it. */
  const where = new Map<string, { scanId: string; slot: number }>();
  const all: ViewerPocket[] = pages
    .filter((page) => page.status === "ready")
    .flatMap((page) =>
      slotted(page.pockets ?? []).map((pocket): ViewerPocket => {
        const key = `${page.scanId}:${pocket.slot}`;
        where.set(key, { scanId: page.scanId, slot: pocket.slot });
        const read = pocket.state === "empty" ? null : pocket.read;
        const seen = page.vision?.pockets.find((each) => each.slot === pocket.slot);
        return {
          key,
          page: page.page,
          slot: pocket.slot,
          photo: page.photos.pockets[pocket.slot] ?? null,
          state: pocket.state,
          pick: picks[page.scanId]?.[pocket.slot] ?? null,
          matches: pocket.state === "found" ? pocket.matches : [],
          sure: pocket.state === "found" ? pocket.sure : undefined,
          note: pocket.state === "empty" ? undefined : pocket.note,
          suggestions: pocket.state === "unread" ? pocket.suggestions : undefined,
          lookFor: read ? read.englishName || read.name : "",
          taken: taken.has(pocketAt(page.page, pocket.slot)),
          status: pocket.status,
          reasons: pocket.reasons,
          glare: pocket.glare ?? seen?.glare ?? false,
          printingUncertain: pocket.printingUncertain,
        };
      }),
    );
  const byKey = new Map(all.map((pocket) => [pocket.key, pocket]));
  const doubtful = all.filter((pocket) =>
    needsLook(pocket, looked[pocket.key] === true),
  );

  const choose = (key: string, pick: ViewerPick | null) => {
    const at = where.get(key);
    if (!at) return;
    setPicks((current) => ({
      ...current,
      [at.scanId]: (current[at.scanId] ?? []).map((each, slot) =>
        slot === at.slot ? pick : each,
      ),
    }));
    setLooked((current) => ({ ...current, [key]: true }));
  };

  /* The viewer's pockets, as they stand now; a page retaken since it
     opened drops out rather than show a pocket that is no longer there. */
  const shown = walk
    ? walk.keys.flatMap((key) => {
        const pocket = byKey.get(key);
        return pocket ? [pocket] : [];
      })
    : [];
  const at = walk ? Math.min(walk.at, Math.max(0, shown.length - 1)) : 0;
  /* "That's it" and "Leave empty" move on, and close after the last. */
  const onward = (index: number) =>
    setWalk((current) =>
      current && index < shown.length - 1
        ? { keys: current.keys, at: index + 1 }
        : null,
    );

  /* Every read page with its own number: a queue may skip one. */
  const choices = pages
    .filter((page) => page.status === "ready")
    .map((page) => ({
      page: page.page,
      choices: (picks[page.scanId] ?? []).map((pick): PocketChoice =>
        pick ? { cardId: pick.hit.id, printingId: pick.printingId } : null,
      ),
    }));
  const chosenPages = pagesWithCards(choices.map((page) => page.choices));

  /*
   * Placed with "ask": a pocket already holding a different card places
   * nothing and asks, "Move them and place" sending that part and the
   * rest again with "replace". A long queue goes in parts, so the parts
   * before the one that asked are in already: on Cancel the check says
   * what went in, and the rest waits.
   */
  const place = async (mode: PlaceMode = "ask", resume?: PlaceResume) => {
    if (busy && !resume) return;
    const placements = pagePlacements(choices);
    if (placements.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await placePageQueue(batchId, placements, mode, resume);
      if (!alive.current) return;
      if (result.ok) {
        onPlaced(result.message);
        setBusy(false);
        return;
      }
      const cancel = () => {
        if (!alive.current) return;
        setBusy(false);
        if (placedAny(result.resume.totals)) {
          setError(pagesPlacedLine(result.resume.totals));
        }
      };
      Alert.alert(
        result.message,
        undefined,
        [
          { text: CANCEL_PLACING, style: "cancel", onPress: cancel },
          {
            text: MOVE_AND_PLACE,
            onPress: () => void place("replace", result.resume),
          },
        ],
        { cancelable: true, onDismiss: cancel },
      );
    } catch (caught) {
      if (alive.current) {
        setBusy(false);
        setError(
          serverMessage(caught) ?? `That did not save. ${friendlyError(caught)}`,
        );
      }
    }
  };

  /* One pocket read again on its own: the new pocket replaces the old,
     its first guess chosen afresh, and it is to be looked at again. */
  const rescan = async (key: string): Promise<boolean> => {
    const at = where.get(key);
    if (!at) return false;
    try {
      const answer = await rescanPagePocket(at.scanId, at.slot);
      if (!answer.ok) return false;
      if (!alive.current) return true;
      setPages((current) =>
        current
          ? current.map((page) =>
              page.scanId === at.scanId && page.pockets
                ? {
                    ...page,
                    pockets: [
                      ...page.pockets.filter((pocket) => pocket.slot !== at.slot),
                      answer.pocket,
                    ],
                  }
                : page,
            )
          : current,
      );
      setPicks((current) => ({
        ...current,
        [at.scanId]: (current[at.scanId] ?? []).map((each, slot) =>
          slot === at.slot ? firstPick(answer.pocket) : each,
        ),
      }));
      setLooked((current) =>
        Object.fromEntries(Object.entries(current).filter(([each]) => each !== key)),
      );
      return true;
    } catch (caught) {
      console.warn("[cardflare] pocket rescan failed", friendlyError(caught));
      return false;
    }
  };

  /* The page the player is lining up, and its corners sent: the page is
     read again, so it is back to reading here until it has been. */
  const lining = aligning ? pages.find((page) => page.scanId === aligning) : undefined;
  const readAgain = async (scanId: string, corners: Quad) => {
    try {
      await realignPage(scanId, corners);
    } catch (caught) {
      /* Busy is a read already on its way; gone is gone. Either way the
         queue says how it stands. */
      if (!(
        caught instanceof ApiError &&
        (caught.status === 409 || caught.status === 404)
      )) {
        throw new Error(friendlyError(caught));
      }
    }
    if (!alive.current) return;
    setPages((current) =>
      current
        ? current.map((page) =>
            page.scanId === scanId ? { ...page, status: "queued", error: null } : page,
          )
        : current,
    );
    setAligning(null);
    void load();
  };

  const throwAway = () =>
    Alert.alert(`${THROW_PAGES_AWAY}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: THROW_PAGES_AWAY,
        style: "destructive",
        onPress: () => {
          setBusy(true);
          setError(null);
          void discardPageQueue(batchId)
            .then(() => {
              if (alive.current) gone.current();
            })
            .catch((caught: unknown) => {
              if (!alive.current) return;
              setBusy(false);
              setError(
                serverMessage(caught) ?? `That did not save. ${friendlyError(caught)}`,
              );
            });
        },
      },
    ]);

  /* Three across, measured off the window, as the pasted list's grid. */
  const tile = Math.floor((window.width - 2 * gutter - 2 * spacing(2)) / 3);
  return (
    <View style={{ flex: 1, gap: spacing(2), paddingBottom: spacing(2) }}>
      {doubtful.length > 0 ? (
        <Button
          label={checkUnsureLabel(doubtful.length)}
          variant="secondary"
          onPress={() => setWalk({ keys: doubtful.map((pocket) => pocket.key), at: 0 })}
        />
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing(5), paddingBottom: spacing(4) }}
      >
        {pages.map((page) => {
          const number = page.page;
          return (
            <View key={page.scanId} style={{ gap: spacing(3) }}>
              <Text accessibilityRole="header" style={styles.heading}>
                {`Page ${number}`}
              </Text>
              {page.vision?.blurry ? (
                <View style={styles.flag}>
                  <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
                  <Text style={[styles.line, { flex: 1 }]}>{BLURRY_PAGE}</Text>
                </View>
              ) : null}
              {page.status === "ready" ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}
                >
                  {all
                    .filter((pocket) => where.get(pocket.key)?.scanId === page.scanId)
                    .map((pocket) => (
                      <PocketTile
                        key={pocket.key}
                        pocket={pocket}
                        width={tile}
                        onPress={() =>
                          setWalk({
                            keys: all.map((each) => each.key),
                            at: all.findIndex((each) => each.key === pocket.key),
                          })
                        }
                      />
                    ))}
                </View>
              ) : page.status === "failed" && page.error === "needs-alignment" ? (
                <View style={{ gap: spacing(2) }}>
                  <Text style={styles.body}>{PAGE_NEEDS_LINING_UP}</Text>
                  {page.photos.page && page.vision ? (
                    <Button
                      label={LINE_UP_PAGE}
                      onPress={() => setAligning(page.scanId)}
                    />
                  ) : null}
                  <Button
                    label={RETAKE}
                    variant="secondary"
                    onPress={() => setRetaking(number)}
                  />
                </View>
              ) : page.status === "failed" ? (
                <View style={{ gap: spacing(2) }}>
                  <Text style={styles.body}>
                    {page.error === "timeout" ? PAGE_TOOK_TOO_LONG : PAGE_FAILED}
                  </Text>
                  <Button
                    label={RETAKE}
                    variant="secondary"
                    onPress={() => setRetaking(number)}
                  />
                </View>
              ) : (
                <View
                  accessibilityLiveRegion="polite"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.line}>{READING_PAGE}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <ErrorLine message={error} />
      {/* Placing ends the queue, so it waits for every page to be read
          or to have failed: a page still reading is never thrown away. */}
      <Button
        label={addPagesLabel(chosenPages)}
        busy={busy}
        disabled={chosenPages === 0 || !settled}
        onPress={() => void place()}
      />
      <Button
        label={THROW_PAGES_AWAY}
        variant="secondary"
        disabled={busy}
        onPress={throwAway}
      />

      {/* The viewer over the check: close is back to the grid. */}
      <Modal
        visible={walk !== null && shown.length > 0}
        animationType="fade"
        onRequestClose={() => setWalk(null)}
      >
        {walk && shown.length > 0 ? (
          <CardViewer
            pockets={shown}
            index={at}
            onIndex={(index) =>
              setWalk((current) => (current ? { keys: current.keys, at: index } : null))
            }
            onPick={(index, pick) => choose(shown[index].key, pick)}
            onConfirm={(index) => {
              setLooked((current) => ({ ...current, [shown[index].key]: true }));
              onward(index);
            }}
            onLeaveEmpty={(index) => {
              choose(shown[index].key, null);
              onward(index);
            }}
            onRescan={(index) => rescan(shown[index].key)}
            onClose={() => setWalk(null)}
          />
        ) : null}
      </Modal>

      {/* A page the scanner could not find the pockets on, lined up by
          hand from where it last put the page. */}
      {lining?.photos.page && lining.vision ? (
        <PageAlignSheet
          visible
          photo={lining.photos.page}
          size={{ width: lining.vision.width, height: lining.vision.height }}
          start={lining.vision.corners ?? lining.vision.page}
          onRead={(corners) => readAgain(lining.scanId, corners)}
          onClose={() => setAligning(null)}
        />
      ) : null}

      {/* The failed page shot again, in this queue under its own number. */}
      <CardScanner
        visible={retaking !== null}
        binderId={binderId}
        occupied={occupied}
        retake={{ batchId, page: retaking ?? 1 }}
        onClose={(sent) => {
          setRetaking(null);
          if (sent) void load();
        }}
      />
    </View>
  );
}

/**
 * One pocket on the check grid, the website's tile: the card we matched
 * (or the player's own photo when the card has no art), a "?" for one we
 * could not read, nothing for an empty one. Under it a band in its
 * status's colour: a dot, its name (A1 to C3), and its status in a word
 * (matched in the success colour, check this one in the warning colour,
 * can't identify in the danger colour, empty muted). A plain border: the
 * accent outline means "you have this" elsewhere, and here a card is
 * only a guess until it is placed. A guess the reader was not sure of
 * wears a small mark in one top corner, a pocket already full in this
 * binder another in the other.
 */
function PocketTile({
  pocket,
  width,
  onPress,
}: {
  pocket: ViewerPocket;
  width: number;
  onPress: () => void;
}) {
  const height = Math.round((width * 88) / 63);
  const pick = pocket.pick;
  const art = pick ? (pickArt(pick) ?? pocket.photo) : null;
  const status = pocketStatus(pocket);
  const tone = colors[STATUS_TOKEN[status]];
  const word = statusWord(status);
  const unsure = pocket.state === "found" && status === "ambiguous";
  const unread = pocket.state === "unread";
  const name = pocketName({ slot: pocket.slot ?? 0 });
  const label = pick
    ? `${name}: ${pick.hit.name}. ${unsure ? NOT_SURE : word}`
    : `${name}: ${unread ? POCKET_UNREAD : POCKET_EMPTY}`;
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width,
        borderRadius: radius.control / 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          height,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pick || unread ? colors.elevated : colors.canvas,
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
        ) : unread ? (
          <Text style={styles.unknown}>?</Text>
        ) : null}
        {unsure ? (
          <View style={styles.unsureMark}>
            <Ionicons name="help-circle" size={14} color={colors.warning} />
          </View>
        ) : null}
        {pocket.taken ? (
          <View style={styles.takenMark}>
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
          </View>
        ) : null}
      </View>
      {/* The band: the status's colour, faint, under its dot, name and word. */}
      <View style={styles.band}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: tone, opacity: 0.15 }]}
        />
        <View style={[styles.statusDot, { backgroundColor: tone }]} />
        <Text style={styles.name}>{name}</Text>
        <Text numberOfLines={1} style={[styles.statusWord, { color: tone }]}>
          {word}
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  takenMark: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 999,
    padding: 1,
    backgroundColor: colors.scrim,
  },
  unsureMark: {
    position: "absolute",
    top: 4,
    left: 4,
    borderRadius: 999,
    padding: 1,
    backgroundColor: colors.scrim,
  },
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    overflow: "hidden",
  },
  name: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusWord: { flexShrink: 1, fontSize: 10 },
  flag: { flexDirection: "row", alignItems: "flex-start", gap: spacing(1.5) },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  body: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  line: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  tileName: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  unknown: { color: colors.textSecondary, fontSize: 24, fontWeight: "600" },
  small: { color: colors.textMuted, fontSize: 12 },
});
