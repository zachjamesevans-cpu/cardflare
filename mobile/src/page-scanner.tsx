import { Ionicons } from "@expo/vector-icons";
import { CameraView } from "expo-camera";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
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
  type CardHit,
  type PocketOutcome,
  type QueuedPage,
  describeError,
  discardPageQueue,
  friendlyError,
  getPageQueue,
  getPageQueues,
  placePageQueue,
  sendScanPage,
  serverMessage,
} from "./api";
import { CameraAllowed, PrintingChips } from "./card-scanner";
import { useCardSearch } from "./card-select";
import { leadArt } from "./flare-bits";
import { GameSearchField } from "./game-chips";
import { searchPlaceholder } from "./game-scope";
import {
  canTakeAnother,
  newBatchId,
  nextToSend,
  pageCells,
  pageFrame,
  pagePlacements,
  pageResize,
  pagesWithCards,
  pocketInPhoto,
  queueSettled,
  sendRefusalLine,
  stillSending,
  type PageStatus,
  type PocketChoice,
} from "./page-scan";
import { RemoteImage } from "./remote-image";
import {
  BACK_TO_PAGES,
  BINDER_PAGES,
  CHECK_PAGES,
  DONE_SCANNING,
  FIND_THE_CARD,
  IS_THIS_IT,
  LEAVE_EMPTY,
  NOT_SURE,
  OTHER_MATCHES,
  PAGE_FAILED,
  PAGE_SENT,
  PAGE_TOOK_TOO_LONG,
  PAGES_HINT,
  POCKET_EMPTY,
  POCKET_TAKEN,
  POCKET_UNREAD,
  POCKETS_PER_PAGE,
  READING_IN_BACKGROUND,
  READING_PAGE,
  REMOVE_PAGE,
  RETAKE,
  SCAN_AGAIN,
  SCAN_MAX_BYTES,
  SCAN_REFUSALS,
  SENDING_PAGE,
  START_EARLIER,
  START_LATER,
  THROW_PAGES_AWAY,
  addPagesLabel,
  firstEmptyPage,
  pagesLeftLine,
  pocketAt,
  startingAtLine,
  takePageLabel,
} from "./scan-copy";
import { frameInPhoto, scanResize } from "./scan-frame";
import { scanHit } from "./scan-hit";
import { SwipeToClose } from "./sheet-swipe";
import { Stepper } from "./stepper";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, ErrorLine, Loading, Muted, SheetClose, Tap, Title } from "./ui";

/**
 * Whole binder pages into a queue, read on the server, then into the
 * binder, pocket for pocket. The founder (2026-10-09): "would be cool if
 * someone could scan, let's say 5 pages of their binder into a queue and
 * it auto fills in an actual binder", and then: "the full binder page
 * scans should be fully agentic. It is a further away picture, often
 * with glare inside a binder, so it's best to have it do a full pass.
 * Maybe it scans it, and then they'll get a notification once it's
 * ready."
 *
 * The website's steps in the website's order:
 *
 * a. "Starting at page 4", a minus and a plus, the hint, then the
 *    camera with a page-shaped guide (three card-shaped cells across,
 *    three down), the shutter, "Take page 4", and "18 of 20 pages left
 *    today" under it. None left: the day's refusal instead of a shutter.
 * b. Each photo is cut to the guide: the whole page, and its nine
 *    pockets. Pages are SENT one at a time in queue order while the
 *    player keeps shooting; each row says "Sending...", then "Sent", or
 *    why it was turned down, with "Retake". Once one is sent, the line
 *    that it is being read in the background and "Done", which closes
 *    the menu once the sends in flight have gone. Nothing here waits
 *    for a page to be read.
 * c. The binder says "Reading 5 pages..." and then "5 pages ready to
 *    check" with "Check now"; the notice opens the same check. Every
 *    page as its 3x3 grid with the player's own photos from the server,
 *    a pocket opening under its page: the photo, the guess and the
 *    others, the printing, "Find the card", "Leave empty". A page that
 *    did not read says so with "Retake", into the same queue.
 * d. "Add 5 pages to binder" places each chosen card in the pocket it
 *    sat in, on its page's own number. Nothing goes in the tray, and
 *    nothing is placed before the player has looked. "Throw these pages
 *    away" ends the queue with nothing placed.
 */

/** A pocket's card, as the player has it now. */
interface PocketPick {
  hit: CardHit;
  printingId: string | null;
}

/** A page just shot, on its way to be read. */
interface ShotPage {
  id: string;
  /** The binder page it fills, fixed when it is shot. */
  number: number;
  /** The page as shot, cut to the guide, small: the row's thumbnail. */
  thumb: string;
  /** The whole page, base64, until it has gone; null if it could not be made small enough. */
  photo: string | null;
  /** Each pocket, base64, until it has gone; null for one that could not be cut. */
  cells: (string | null)[];
  status: PageStatus;
  /** Why it was turned down, in words. */
  failure: string | null;
}

/**
 * One cut of the photo as JPEG, at the single scan's quality, walking
 * down only past the ceiling. A pocket goes at SCAN_LONG_EDGE, the whole
 * page at PAGE_LONG_EDGE.
 */
async function cutJpeg(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
  resize: { width: number } | { height: number },
): Promise<string | null> {
  let quality = 0.6;
  while (quality >= 0.3) {
    const out = await manipulateAsync(uri, [{ crop }, { resize }], {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (out.base64 && (out.base64.length * 3) / 4 <= SCAN_MAX_BYTES) return out.base64;
    quality -= 0.15;
  }
  return null;
}

/** A pocket, shrunk to a card's size. */
const cutPocket = (
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
) => cutJpeg(uri, crop, scanResize(crop));

/**
 * The guide's part of the photo, through the preview's fit and with no
 * margin of its own: the whole page from it, and its nine pockets, each
 * the website's pocketCrop of that part, shrunk to SCAN_LONG_EDGE.
 */
async function cutPage(
  photo: { uri: string; width: number; height: number },
  view: { width: number; height: number },
): Promise<Pick<ShotPage, "thumb" | "photo" | "cells">> {
  const region = frameInPhoto(pageFrame(view.width, view.height), view, photo, 0);
  const [thumb, whole, ...cells] = await Promise.all([
    manipulateAsync(photo.uri, [{ crop: region }, { resize: { width: 120 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
    }).then((out) => out.uri),
    cutJpeg(photo.uri, region, pageResize(region)),
    ...Array.from({ length: POCKETS_PER_PAGE }, (_, slot) =>
      cutPocket(photo.uri, pocketInPhoto(slot, region)),
    ),
  ]);
  return { thumb, photo: whole, cells };
}

/**
 * One page to the server, to be read there. Answers what the row says
 * next: "Sent", or the reason in words. A page too big to send is
 * turned down here, as the server would.
 */
async function sendPage(
  binderId: string,
  batchId: string,
  page: ShotPage,
): Promise<{ status: PageStatus; failure: string | null; left?: number | null }> {
  if (!page.photo) return { status: "refused", failure: SCAN_REFUSALS["too-big"] };
  try {
    const result = await sendScanPage({
      binderId,
      batchId,
      pageNumber: page.number,
      page: page.photo,
      pockets: page.cells,
    });
    if (result.ok) return { status: "sent", failure: null, left: result.left };
    /* The day's last page has gone: the shutter gives way to the refusal. */
    return {
      status: "refused",
      failure: sendRefusalLine(result.reason),
      ...(result.reason === "daily-pages" ? { left: 0 } : {}),
    };
  } catch (caught) {
    console.warn("[cardflare] page send failed", describeError(caught));
    return { status: "refused", failure: sendRefusalLine("unavailable") };
  }
}

/** A page row's line, under its number. */
function rowLine(page: ShotPage): string {
  if (page.status === "refused") return page.failure ?? PAGE_FAILED;
  return page.status === "sent" ? PAGE_SENT : SENDING_PAGE;
}

/** The guess a found pocket starts with; nothing for any other. */
function firstPick(pocket: PocketOutcome): PocketPick | null {
  if (pocket.state !== "found") return null;
  const top = pocket.matches[0];
  return top
    ? { hit: scanHit(top.card, top.printingId), printingId: top.printingId }
    : null;
}

/** A read page's nine pockets in slot order, an empty one for any not sent back. */
function slotted(pockets: readonly PocketOutcome[]): PocketOutcome[] {
  return Array.from(
    { length: POCKETS_PER_PAGE },
    (_, slot): PocketOutcome =>
      pockets.find((pocket) => pocket.slot === slot) ?? { slot, state: "empty" },
  );
}

/** The art a pick shows: its printing's, else the card's lead art. */
function pickArt(pick: PocketPick): string | null {
  return (
    pick.hit.printings.find((printing) => printing.id === pick.printingId)?.imageUrl ??
    leadArt(pick.hit)
  );
}

let shots = 0;

/**
 * The shooting step: a new queue from the add menu, or one failed page
 * shot again from the check (`retake`), into its own queue under its
 * own number.
 */
export function PageScanner({
  binderId,
  occupied,
  retake,
  onDone,
}: {
  binderId: string;
  /** The pockets this binder already has a card in. */
  occupied: number[];
  /** A page of a queue already out, shot again: it replaces that page. */
  retake?: { batchId: string; page: number };
  /** Every page has gone and the player said Done. */
  onDone: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [start, setStart] = useState(() => retake?.page ?? firstEmptyPage(occupied));
  /* One queue, one id, made once: every page goes under it. */
  const [batchId] = useState(() => retake?.batchId ?? newBatchId());
  const [queue, setQueue] = useState<ShotPage[]>([]);
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  /* Pages this account may still send today; null has no limit,
     undefined is not known yet. */
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  /* Done was pressed: the menu closes once the sends in flight have gone. */
  const [finishing, setFinishing] = useState(false);
  const alive = useRef(true);
  /* The page on its way up, if any: one at a time, whatever the queue does. */
  const sending = useRef<string | null>(null);

  /* Done, once: the parent may paint again before this has gone. */
  const done = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* What today has left, for the line under the shutter. A retake
     replaces a page and costs nothing, so it does not ask. */
  useEffect(() => {
    if (retake) return;
    void getPageQueues(binderId)
      .then((answer) => {
        if (alive.current) setLeft(answer.left);
      })
      .catch(() => {});
  }, [binderId, retake]);

  /* Pages go up one at a time, in queue order, while the player keeps
     shooting. Each answer changes the queue, which brings this round
     again for the next page waiting. Nothing waits for a read. */
  useEffect(() => {
    if (sending.current) return;
    const at = nextToSend(queue);
    if (at < 0) return;
    const page = queue[at];
    sending.current = page.id;
    setQueue((current) =>
      current.map((each) =>
        each.id === page.id ? { ...each, status: "sending" } : each,
      ),
    );
    void sendPage(binderId, batchId, page).then(({ left: after, ...result }) => {
      sending.current = null;
      if (!alive.current) return;
      if (after !== undefined) setLeft(after);
      /* The photos are dropped once sent: the server keeps its own. */
      setQueue((current) =>
        current.map((each) =>
          each.id === page.id
            ? {
                ...each,
                ...result,
                ...(result.status === "sent" ? { photo: null, cells: [] } : {}),
              }
            : each,
        ),
      );
    });
  }, [queue, binderId, batchId]);

  useEffect(() => {
    if (!finishing || stillSending(queue) || done.current) return;
    done.current = true;
    onDone();
  }, [finishing, queue, onDone]);

  const retakeAt = retakeId ? queue.findIndex((page) => page.id === retakeId) : -1;
  const last = queue[queue.length - 1];
  const nextNumber =
    retakeAt >= 0 ? queue[retakeAt].number : last ? last.number + 1 : start;
  /* A page not yet answered for counts against the day already. A
     retake from the check replaces a page and costs nothing. */
  const pending = queue.filter(
    (page) => page.status === "waiting" || page.status === "sending",
  ).length;
  const leftNow =
    left === undefined || left === null ? left : Math.max(0, left - pending);
  const outForToday = !retake && leftNow === 0;
  const canShoot =
    !finishing &&
    (retakeAt >= 0 ||
      (retake
        ? queue.length === 0
        : !outForToday && canTakeAnother(nextNumber, queue.length)));

  const shoot = async () => {
    if (!camera.current || !view || capturing || !canShoot) return;
    const replacing = retakeAt >= 0 ? retakeId : null;
    const number = nextNumber;
    setCapturing(true);
    setShotError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!alive.current) return;
      const cut = await cutPage(photo, view);
      if (!alive.current) return;
      shots += 1;
      const page: ShotPage = {
        id: `page-${shots}`,
        number,
        ...cut,
        status: "waiting",
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

  /* Only a page the server turned down can go: one that went is in the
     queue on the server, and is thrown away from the check. */
  const remove = (id: string) => {
    setQueue((current) => current.filter((page) => page.id !== id));
    if (retakeId === id) setRetakeId(null);
  };

  const frame = view ? pageFrame(view.width, view.height) : null;
  const anySent = queue.some((page) => page.status === "sent");
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
        {/* The first page moves only before anything is shot: a page
            sent is that page on the server. */}
        {!retake && queue.length === 0 ? (
          <Stepper
            value={start}
            min={1}
            max={BINDER_PAGES}
            label="page number"
            lessLabel={START_EARLIER}
            moreLabel={START_LATER}
            onChange={setStart}
          />
        ) : null}
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
          {outForToday ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {SCAN_REFUSALS["daily-pages"]}
            </Text>
          ) : (
            <Button
              label={takePageLabel(nextNumber)}
              busy={capturing}
              disabled={!view || !canShoot}
              onPress={() => void shoot()}
            />
          )}
          {!retake && typeof leftNow === "number" && !outForToday ? (
            <Text style={[styles.small, { textAlign: "center" }]}>
              {pagesLeftLine(leftNow)}
            </Text>
          ) : null}
          <ErrorLine message={shotError} />
        </View>
      </CameraAllowed>

      {queue.length > 0 ? (
        <ScrollView
          style={{ maxHeight: 180, flexGrow: 0 }}
          contentContainerStyle={{ gap: spacing(2) }}
        >
          {queue.map((page) => (
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
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowNumber}>{`Page ${page.number}`}</Text>
                <Text
                  accessibilityLiveRegion="polite"
                  style={page.status === "refused" ? styles.body : styles.line}
                  numberOfLines={2}
                >
                  {rowLine(page)}
                </Text>
              </View>
              {page.status === "refused" && !finishing ? (
                <>
                  {outForToday ? null : (
                    <Tap
                      onPress={() => setRetakeId(page.id === retakeId ? null : page.id)}
                      accessibilityLabel={`${RETAKE} page ${page.number}`}
                      accessibilityState={{ selected: page.id === retakeId }}
                      hitSlop={8}
                    >
                      <Text style={styles.action}>{RETAKE}</Text>
                    </Tap>
                  )}
                  <Tap
                    onPress={() => remove(page.id)}
                    accessibilityLabel={`${REMOVE_PAGE} page ${page.number}`}
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>{REMOVE_PAGE}</Text>
                  </Tap>
                </>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {anySent ? (
        <>
          <Muted>{READING_IN_BACKGROUND}</Muted>
          <Button
            label={DONE_SCANNING}
            busy={finishing}
            onPress={() => setFinishing(true)}
          />
        </>
      ) : null}
    </View>
  );
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
 * stands. A read page is the 3x3 grid with the player's own photos from
 * the server's links; one still being read says so and is asked again
 * every ten seconds; one that failed offers "Retake" into this queue.
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
  const [picks, setPicks] = useState<Record<string, (PocketPick | null)[]>>({});
  const [open, setOpen] = useState<{ id: string; slot: number } | null>(null);
  /* A failed page being shot again, by its number. */
  const [retaking, setRetaking] = useState<number | null>(null);
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
    if (pages === null || settled || retaking !== null) return;
    const timer = setTimeout(() => void load(), CHECK_POLL_MS);
    return () => clearTimeout(timer);
  }, [pages, settled, retaking, load]);

  /* The failed page shot again, in this queue under its own number;
     "Back to pages" returns to the check without it. */
  if (retaking !== null) {
    return (
      <View style={{ flex: 1, gap: spacing(3) }}>
        <Button
          label={BACK_TO_PAGES}
          variant="secondary"
          onPress={() => setRetaking(null)}
        />
        <PageScanner
          binderId={binderId}
          occupied={occupied}
          retake={{ batchId, page: retaking }}
          onDone={() => {
            setRetaking(null);
            setOpen(null);
            void load();
          }}
        />
      </View>
    );
  }

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
  const choose = (id: string, slot: number, pick: PocketPick | null) =>
    setPicks((current) => ({
      ...current,
      [id]: (current[id] ?? []).map((each, at) => (at === slot ? pick : each)),
    }));

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

  const place = async () => {
    if (busy) return;
    const placements = pagePlacements(choices);
    if (placements.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await placePageQueue(batchId, placements);
      if (alive.current) onPlaced(result.message);
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing(5), paddingBottom: spacing(4) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {pages.map((page) => {
          const number = page.page;
          const openSlot = open?.id === page.scanId ? open.slot : null;
          const pockets = page.pockets ? slotted(page.pockets) : [];
          const pagePicks = picks[page.scanId] ?? [];
          return (
            <View key={page.scanId} style={{ gap: spacing(3) }}>
              <Text accessibilityRole="header" style={styles.heading}>
                {`Page ${number}`}
              </Text>
              {page.status === "ready" ? (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: spacing(2),
                    }}
                  >
                    {pockets.map((pocket) => (
                      <PocketTile
                        key={pocket.slot}
                        pocket={pocket}
                        pick={pagePicks[pocket.slot] ?? null}
                        photo={page.photos.pockets[pocket.slot] ?? null}
                        taken={taken.has(pocketAt(number, pocket.slot))}
                        open={openSlot === pocket.slot}
                        width={tile}
                        onPress={() =>
                          setOpen(
                            openSlot === pocket.slot
                              ? null
                              : { id: page.scanId, slot: pocket.slot },
                          )
                        }
                      />
                    ))}
                  </View>
                  {openSlot !== null && pockets[openSlot] ? (
                    <PocketDetail
                      key={`${page.scanId}:${openSlot}`}
                      pocket={pockets[openSlot]}
                      pick={pagePicks[openSlot] ?? null}
                      photo={page.photos.pockets[openSlot] ?? null}
                      taken={taken.has(pocketAt(number, openSlot))}
                      onChoose={(pick) => choose(page.scanId, openSlot, pick)}
                      onLeaveEmpty={() => {
                        choose(page.scanId, openSlot, null);
                        setOpen(null);
                      }}
                    />
                  ) : null}
                </>
              ) : page.status === "failed" ? (
                <View style={{ gap: spacing(2) }}>
                  <Text style={styles.body}>
                    {page.error === "timeout" ? PAGE_TOOK_TOO_LONG : PAGE_FAILED}
                  </Text>
                  <Button
                    label={RETAKE}
                    variant="secondary"
                    onPress={() => {
                      setOpen(null);
                      setRetaking(number);
                    }}
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
    </View>
  );
}

/**
 * One pocket on the check grid. A chosen card shows its art, or the
 * player's own photo of the pocket when the card has none; an unread
 * pocket is a "?"; an empty one is faint. A plain border: the accent
 * outline means "you have this" elsewhere, and here a card is only a
 * guess until it is placed. A pocket already full in this binder wears
 * a small mark, and its detail says why; so does a card the reader was
 * not sure of, in the other corner.
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
  const unsure = pocket.state === "found" && pocket.sure === false;
  const label = pick
    ? `Pocket ${pocket.slot + 1}: ${pick.hit.name}`
    : `Pocket ${pocket.slot + 1}: ${pocket.state === "unread" ? POCKET_UNREAD : POCKET_EMPTY}`;
  const said = unsure ? `${label}. ${NOT_SURE}` : label;
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={said}
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
      {unsure ? (
        <View style={styles.unsureMark}>
          <Ionicons name="help-circle" size={14} color={colors.warning} />
        </View>
      ) : null}
    </Tap>
  );
}

/**
 * What was read in one pocket, under its page's grid: the player's own
 * photo beside the card it will be placed with, the other guesses and
 * the printings for a found pocket, the search for one that was not
 * found, and "Leave empty" on every one. A guess the reader was not
 * sure of says so, and the reader's note on how it decided sits under
 * the guess (or under "Couldn't read this one" for an unread pocket).
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
  const unsure = pocket.state === "found" && pocket.sure === false;
  const note = pocket.state === "empty" ? "" : (pocket.note ?? "").trim();

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
          {unsure ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: spacing(1.5),
              }}
            >
              <Ionicons name="help-circle" size={16} color={colors.warning} />
              <Text style={[styles.line, { flex: 1 }]}>{NOT_SURE}</Text>
            </View>
          ) : null}
          {pocket.state === "unread" && !pick ? (
            <Text style={styles.body}>{POCKET_UNREAD}</Text>
          ) : null}
          {pocket.state === "unread" && note ? (
            <Text style={styles.line}>{note}</Text>
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
            {pocket.state === "found" && note ? (
              <Text style={styles.line}>{note}</Text>
            ) : null}
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
  unsureMark: {
    position: "absolute",
    top: 4,
    left: 4,
    borderRadius: 999,
    padding: 1,
    backgroundColor: colors.scrim,
  },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  rowNumber: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
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
