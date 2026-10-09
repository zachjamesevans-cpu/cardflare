import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ApiError,
  type CardHit,
  describeError,
  getScanRights,
  scanCardPhoto,
  sendScanPage,
} from "./api";
import { CardViewer, type ViewerPocket } from "./card-viewer";
import {
  canTakeAnother,
  newBatchId,
  nextToSend,
  pageResize,
  pocketInPhoto,
  sendRefusalLine,
  stillSending,
  type PageStatus,
} from "./page-scan";
import { ProMark } from "./pro-mark";
import { ProWords } from "./pro-words";
import {
  BINDER_PAGES,
  DONE_SCANNING,
  FILL_THE_FRAME,
  GET_PRO,
  PAGES_ARE_PRO,
  POCKETS_PER_PAGE,
  QUEUE_FULL,
  READING_CARD,
  SCAN_AGAIN,
  SCAN_INTRO_PAGES,
  SCAN_INTRO_SINGLE,
  SCAN_MAX_BYTES,
  SCAN_REFUSALS,
  SENDING_PAGE,
  START_EARLIER,
  START_LATER,
  TAKE_PHOTO,
  firstEmptyPage,
  freeScansLeftLine,
  pageAddedLine,
  pagesLeftLine,
  startingAtLine,
  takePageLabel,
} from "./scan-copy";
import {
  NO_SCAN_RIGHTS,
  afterSingleScan,
  freeScansGone,
  rightsAfter,
  type ScanRights,
} from "./scan-flow";
import { frameInPhoto, guideFrame, scanResize } from "./scan-frame";
import { scanHit } from "./scan-hit";
import { Stepper } from "./stepper";
import { colors, gutter, radius, spacing } from "./theme";
import { AsyncButton, Body, Button, Loading, SheetClose, Tap } from "./ui";

/**
 * The one scanner, full screen, for one card or a whole binder page.
 * The founder (2026-10-09): "a unified scan - it can detect if it's
 * scanning a full page and says you need pro for that. and on the
 * screen it'll say something like 'Scan a single, or scan a page in
 * your binder for Pro'", and "Free singles up to 10 a day." The
 * website's steps in the website's order (src/components/cards/):
 *
 * a. "Scan a card.", "Scan a whole binder page with PRO", the hint, the
 *    free scans left today; the camera with one card-shaped outline (a
 *    nine-pocket page is a card's shape too) and "Take photo".
 * b. Every photo is read as one card first: the outline's part, shrunk
 *    to the website's size. The photo itself is kept until the answer.
 * c. A card: the card viewer (src/card-viewer.tsx). "That's it" puts it
 *    in the add menu's tray and the camera is back for the next one.
 * d. A whole page, for a player who scans pages: the kept photo is cut
 *    into the page and its nine pockets and sent to be read in the
 *    background, under one queue for this whole session, on the page a
 *    small "Page 4" chip says (the first empty one to begin with). "Page
 *    4 added" when it has gone, and the camera stays.
 * e. A whole page for anyone else, or the day's free scans gone (asked
 *    at the shutter, before anything is sent): the door to Pro, in the
 *    scanner, "Get Pro" and "Try again". Any other refusal in its own
 *    words; a card read but not found puts its name in the menu's search.
 * f. "Done" (or the X) closes it, once the pages on their way have gone.
 *
 * A failed page shot again from the check opens this too (`retake`):
 * the photo is that page already, so it is cut and sent at once, under
 * its queue and its number, and the scanner closes when it has gone.
 *
 * The camera is asked for here and nowhere else: this only opens on a
 * tap of "Scan" (or "Retake"), and that tap is the consent to ask.
 */

type Step =
  | { kind: "camera" }
  | { kind: "reading" }
  | { kind: "viewer"; pocket: ViewerPocket }
  | { kind: "pro"; why: "pages" | "daily-singles" }
  | { kind: "refused"; line: string };

/** A page just shot, on its way to be read. */
interface ShotPage {
  id: string;
  /** The binder page it fills, fixed when it is shot. */
  number: number;
  /** The whole page, base64, until it has gone; null if it could not be made small enough. */
  photo: string | null;
  /** Each pocket, base64, until it has gone; null for one that could not be cut. */
  cells: (string | null)[];
  status: PageStatus;
}

/** How long the read runs before the quiet progress line shows. */
const SLOW_MS = 1500;
/** How long "Page 4 added" stays. */
const TOAST_MS = 4000;

type Photo = { uri: string; width: number; height: number };
type Size = { width: number; height: number };

/**
 * The outline's part of the photo, its long side at SCAN_LONG_EDGE, as
 * base64 JPEG and as a file for "Your photo". Quality walks down only if
 * a photo would still be over the server's ceiling, which at this size
 * it should never be.
 */
async function shrinkPhoto(
  photo: Photo,
  view: Size,
): Promise<{ base64: string; uri: string } | null> {
  const crop = frameInPhoto(guideFrame(view.width, view.height), view, photo);
  let quality = 0.6;
  while (quality >= 0.3) {
    const out = await manipulateAsync(
      photo.uri,
      [{ crop }, { resize: scanResize(crop) }],
      { compress: quality, format: SaveFormat.JPEG, base64: true },
    );
    const encoded = out.base64 ?? null;
    if (encoded && (encoded.length * 3) / 4 <= SCAN_MAX_BYTES) {
      return { base64: encoded, uri: out.uri };
    }
    quality -= 0.15;
  }
  return null;
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
 * The outline's part of the kept photo, exactly (a page has no margin
 * of its own): the whole page from it, and its nine pockets, each the
 * website's pocketCrop of that part, shrunk to SCAN_LONG_EDGE.
 */
async function cutPage(
  photo: Photo,
  view: Size,
): Promise<Pick<ShotPage, "photo" | "cells">> {
  const region = frameInPhoto(guideFrame(view.width, view.height), view, photo, 0);
  const [whole, ...cells] = await Promise.all([
    cutJpeg(photo.uri, region, pageResize(region)),
    ...Array.from({ length: POCKETS_PER_PAGE }, (_, slot) =>
      cutPocket(photo.uri, pocketInPhoto(slot, region)),
    ),
  ]);
  return { photo: whole, cells };
}

/**
 * One page to the server, to be read there: sent, or the reason in
 * words. A page too big to send is turned down here, as the server would.
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

let shots = 0;

type ScannerProps = {
  binderId: string;
  /** The pockets this binder already has a card in, for the first empty page. */
  occupied: number[];
  /** What the server lets this player scan. Not asked on a retake. */
  rights?: ScanRights;
  /** A failed page of a queue already out, shot again. */
  retake?: { batchId: string; page: number };
  /** The free scans counted down, for the menu to keep. */
  onRights?: (rights: ScanRights) => void;
  /** "That's it": into the menu's tray, one copy, or one more if it is there already. */
  onAdd?: (hit: CardHit, printingId: string | null) => void;
  /** A card read but not found: what to put in the menu's search. */
  onNotFound?: (query: string) => void;
  /** "Get Pro": the Pro screen. */
  onGetPro?: () => void;
  /** Closed; `sent` when a page went to be read. */
  onClose: (sent: boolean) => void;
};

export function CardScanner({
  visible,
  ...props
}: ScannerProps & { visible: boolean }) {
  /* The hardware back button is "Done": the body says what that means. */
  const close = useRef<() => void>(() => props.onClose(false));
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => close.current()}
    >
      <Scanner {...props} close={close} />
    </Modal>
  );
}

function Scanner({
  binderId,
  occupied,
  rights: given,
  retake,
  onRights,
  onAdd,
  onNotFound,
  onGetPro,
  onClose,
  close,
}: ScannerProps & { close: MutableRefObject<() => void> }) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [view, setView] = useState<Size | null>(null);
  const [rights, setRights] = useState<ScanRights>(given ?? NO_SCAN_RIGHTS);
  const [step, setStep] = useState<Step>({ kind: "camera" });
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);
  /* The shutter is open, or a page is being cut: the camera stays on
     screen until the photo is taken, because taking it from a camera
     already unmounted fails. */
  const [capturing, setCapturing] = useState(false);

  /* Whole pages: one queue for this whole session, the page the next
     one fills, and what today has left once a page has gone. */
  const [batchId] = useState(() => retake?.batchId ?? newBatchId());
  const [queue, setQueue] = useState<ShotPage[]>([]);
  const [start, setStart] = useState(() => retake?.page ?? firstEmptyPage(occupied));
  const [chipOpen, setChipOpen] = useState(false);
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  /* "Page 4 added", or why a page was turned down, over the foot. */
  const [toast, setToast] = useState<{ line: string; alert: boolean } | null>(null);
  /* Done was pressed: the scanner closes once the sends in flight have gone. */
  const [finishing, setFinishing] = useState(false);

  const alive = useRef(true);
  /* The page on its way up, if any: one at a time, whatever the queue does. */
  const sending = useRef<string | null>(null);
  /* Done, once: the parent may paint again before this has gone. */
  const done = useRef(false);
  /* Read after an await, so a page is never filed under a stale number. */
  const startNow = useRef(start);
  startNow.current = start;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* The progress line only once the wait is a wait. */
  useEffect(() => {
    if (step.kind !== "reading") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [step.kind]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

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
      if (result.status === "sent") {
        setToast({ line: pageAddedLine(page.number), alert: false });
        /* The photos are dropped once sent: the server keeps its own. */
        setQueue((current) =>
          current.map((each) =>
            each.id === page.id
              ? { ...each, status: "sent", photo: null, cells: [] }
              : each,
          ),
        );
        return;
      }
      /* Turned down: off the queue, its words on screen, and the next
         photo fills its page again. */
      if (result.failure) setToast({ line: result.failure, alert: true });
      setQueue((current) => current.filter((each) => each.id !== page.id));
      setStart((current) => (current === page.number + 1 ? page.number : current));
    });
  }, [queue, binderId, batchId]);

  const anySent = queue.some((page) => page.status === "sent");

  /* A retake is done the moment its page has gone. */
  useEffect(() => {
    if (retake && anySent) setFinishing(true);
  }, [retake, anySent]);

  useEffect(() => {
    if (!finishing || stillSending(queue) || done.current) return;
    done.current = true;
    onClose(queue.some((page) => page.status === "sent"));
  }, [finishing, queue, onClose]);

  const finish = () => {
    if (capturing) return;
    setFinishing(true);
  };
  const again = () => setStep({ kind: "camera" });
  /* Back from the card viewer is the camera; anywhere else, Done. */
  close.current = step.kind === "viewer" ? again : finish;

  /* A page not yet answered for counts against the day already. */
  const pending = queue.filter(
    (page) => page.status === "waiting" || page.status === "sending",
  ).length;
  const leftNow =
    left === undefined || left === null ? left : Math.max(0, left - pending);

  /** The kept photo, as a page: cut, and queued to be sent. */
  const queuePage = async (photo: Photo, size: Size) => {
    const number = startNow.current;
    if (!retake && leftNow === 0) {
      setStep({ kind: "refused", line: SCAN_REFUSALS["daily-pages"] });
      return;
    }
    if (!retake && !canTakeAnother(number, queue.length)) {
      setStep({ kind: "refused", line: QUEUE_FULL });
      return;
    }
    setStep({ kind: "camera" });
    setCapturing(true);
    try {
      const cut = await cutPage(photo, size);
      if (!alive.current) return;
      shots += 1;
      setQueue((current) => [
        ...current,
        { id: `page-${shots}`, number, ...cut, status: "waiting" },
      ]);
      if (!retake) setStart(Math.min(BINDER_PAGES, number + 1));
      setChipOpen(false);
    } finally {
      if (alive.current) setCapturing(false);
    }
  };

  const shoot = async () => {
    if (!camera.current || !view || step.kind !== "camera" || capturing || finishing) {
      return;
    }
    setToast(null);
    /* The day's free scans are gone: the door to Pro, nothing sent. */
    if (!retake && freeScansGone(rights)) {
      setStep({ kind: "pro", why: "daily-singles" });
      return;
    }
    setProgress(0);
    setCapturing(true);
    try {
      /* The full photo, kept until the answer comes: a page is cut from it. */
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!alive.current) return;
      setCapturing(false);
      if (retake) {
        await queuePage(photo, view);
        return;
      }
      setStep({ kind: "reading" });
      const shrunk = await shrinkPhoto(photo, view);
      if (!shrunk) {
        if (alive.current) setStep({ kind: "refused", line: SCAN_REFUSALS["too-big"] });
        return;
      }
      const outcome = await scanCardPhoto(shrunk.base64, (sent, total) => {
        if (alive.current) setProgress(sent / total);
      });
      if (!alive.current) return;
      const answer = outcome.ok
        ? ({ ok: true } as const)
        : ({ ok: false, reason: outcome.reason } as const);
      const after = rightsAfter(rights, answer);
      setRights(after);
      onRights?.(after);
      /* The server counts free scans; its count is the one shown. */
      if (rights.singlesLeft !== null) {
        void getScanRights()
          .then((now) => {
            if (!alive.current) return;
            setRights(now);
            onRights?.(now);
          })
          .catch(() => {});
      }

      const next = afterSingleScan(answer, rights);
      if (next.kind === "viewer" && outcome.ok) {
        const top = outcome.matches[0];
        setStep({
          kind: "viewer",
          pocket: {
            key: `scan-${shots}`,
            photo: shrunk.uri,
            state: "found",
            pick: top
              ? { hit: scanHit(top.card, top.printingId), printingId: top.printingId }
              : null,
            matches: outcome.matches,
            sure: outcome.sure,
            note: outcome.note,
            lookFor: outcome.read.englishName || outcome.read.name,
          },
        });
        return;
      }
      if (next.kind === "send-page") {
        await queuePage(photo, view);
        return;
      }
      if (next.kind === "pro") {
        setStep({ kind: "pro", why: next.why });
        return;
      }
      if (!outcome.ok && outcome.reason === "not-found" && outcome.read) {
        const name = outcome.read.englishName || outcome.read.name;
        if (name) onNotFound?.(name);
      }
      setStep({
        kind: "refused",
        line: SCAN_REFUSALS[next.kind === "refused" ? next.reason : "unavailable"],
      });
    } catch (caught) {
      /* The website's words for a scan that broke on the way: the cause
         goes to the log, the player hears the scanner is down. */
      console.warn("[cardflare] card scan failed", describeError(caught));
      if (!alive.current) return;
      setCapturing(false);
      setStep({
        kind: "refused",
        line: SCAN_REFUSALS[
          caught instanceof ApiError && caught.status === 429 ? "limit" : "unavailable"
        ],
      });
    }
  };

  /* The answer, full screen: the same viewer the page check uses. */
  if (step.kind === "viewer") {
    return (
      <CardViewer
        pockets={[step.pocket]}
        index={0}
        onIndex={() => {}}
        onPick={(_, pick) => setStep({ ...step, pocket: { ...step.pocket, pick } })}
        onConfirm={() => {
          const pick = step.pocket.pick;
          if (pick) onAdd?.(pick.hit, pick.printingId);
          again();
        }}
        onClose={again}
      />
    );
  }

  const sendingNow = queue.some((page) => page.status === "sending");
  const pagesOut = queue.length > 0;

  let body: ReactNode;
  if (step.kind === "reading") {
    body = (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Loading label={READING_CARD} />
        {slow ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
    );
  } else if (step.kind === "pro") {
    /* The door to Pro, in the scanner: why, PRO large, the way there,
       and the camera again. */
    body = (
      <View style={styles.door}>
        <Text accessibilityLiveRegion="polite" style={styles.refusal}>
          <ProWords
            text={step.why === "pages" ? PAGES_ARE_PRO : SCAN_REFUSALS["daily-singles"]}
          />
        </Text>
        <ProMark size={56} />
        <View style={{ alignSelf: "stretch", gap: spacing(2) }}>
          {onGetPro ? <Button label={GET_PRO} onPress={onGetPro} /> : null}
          <Button label={SCAN_AGAIN} variant="secondary" onPress={again} />
        </View>
      </View>
    );
  } else if (step.kind === "refused") {
    body = (
      <View style={{ flex: 1, justifyContent: "center", gap: spacing(3) }}>
        <Text accessibilityLiveRegion="polite" style={styles.refusal}>
          {step.line}
        </Text>
        <Button label={SCAN_AGAIN} variant="secondary" onPress={again} />
      </View>
    );
  } else {
    const frame = view ? guideFrame(view.width, view.height) : null;
    body = (
      <View style={{ flex: 1, gap: spacing(3) }}>
        {retake ? (
          <Text style={styles.hint}>{FILL_THE_FRAME}</Text>
        ) : (
          <View style={{ alignItems: "center", gap: spacing(1) }}>
            <Text accessibilityRole="header" style={styles.intro}>
              {SCAN_INTRO_SINGLE}
            </Text>
            <Text style={styles.introPages}>
              {SCAN_INTRO_PAGES} <ProMark size={15} />
            </Text>
            <Text style={styles.hint}>{FILL_THE_FRAME}</Text>
            {rights.singlesLeft !== null ? (
              <Text style={styles.small}>{freeScansLeftLine(rights.singlesLeft)}</Text>
            ) : null}
          </View>
        )}

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
              {frame ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.frame,
                    {
                      left: frame.x,
                      top: frame.y,
                      width: frame.width,
                      height: frame.height,
                    },
                  ]}
                />
              ) : null}
            </View>
            <Button
              label={retake ? takePageLabel(retake.page) : TAKE_PHOTO}
              busy={capturing}
              disabled={!view || finishing}
              onPress={() => void shoot()}
            />
          </View>
        </CameraAllowed>

        {/* Where the next page goes, once a page has been shot; a tap
            to move it. */}
        {!retake && pagesOut ? (
          <View style={{ alignItems: "center", gap: spacing(2) }}>
            <Tap
              onPress={() => setChipOpen((open) => !open)}
              accessibilityLabel={startingAtLine(start)}
              accessibilityState={{ expanded: chipOpen }}
              style={styles.chip}
            >
              <Ionicons name="albums-outline" size={14} color={colors.accent} />
              <Text style={styles.chipLabel}>{`Page ${start}`}</Text>
            </Tap>
            {chipOpen ? (
              <View style={styles.startRow}>
                <Text style={styles.line}>{startingAtLine(start)}</Text>
                <Stepper
                  value={start}
                  min={1}
                  max={BINDER_PAGES}
                  label="page number"
                  lessLabel={START_EARLIER}
                  moreLabel={START_LATER}
                  onChange={setStart}
                />
              </View>
            ) : null}
          </View>
        ) : null}
        {sendingNow ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.line}>{SENDING_PAGE}</Text>
          </View>
        ) : null}
        {!retake && anySent && typeof leftNow === "number" ? (
          <Text style={[styles.small, { textAlign: "center" }]}>
            {pagesLeftLine(leftNow)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: insets.top + spacing(2),
        paddingBottom: insets.bottom + spacing(3),
        paddingHorizontal: gutter,
        gap: spacing(3),
      }}
    >
      <View style={styles.top}>
        <SheetClose onPress={finish} />
      </View>

      {body}

      <Button
        label={DONE_SCANNING}
        variant="secondary"
        busy={finishing}
        disabled={capturing}
        onPress={finish}
      />

      {toast ? (
        <Text
          accessibilityLiveRegion={toast.alert ? "assertive" : "polite"}
          style={[styles.toast, { bottom: insets.bottom + spacing(20) }]}
        >
          {toast.line}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The camera, once it may be used; asked for once, the moment the
 * scanner opens. The tap on "Scan" is the reason, so the system's sheet
 * arrives with its context. One card or a whole page, the camera is
 * asked for here and nowhere else.
 */
export function CameraAllowed({ children }: { children: ReactNode }) {
  const [permission, requestPermission] = useCameraPermissions();
  const asked = useRef(false);

  useEffect(() => {
    if (!permission || permission.granted || asked.current) return;
    if (!permission.canAskAgain) return;
    asked.current = true;
    void requestPermission();
  }, [permission, requestPermission]);

  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", gap: spacing(3) }}>
        <Body>The camera is only used to read the card you hold up to it.</Body>
        {permission.canAskAgain ? (
          <AsyncButton
            label="Allow camera"
            pendingLabel="Asking…"
            onPress={() => requestPermission()}
          />
        ) : (
          /* iOS asks once. After a refusal the only way back is the
             Settings app, as on the code scanner. */
          <AsyncButton
            label="Open Settings"
            pendingLabel="Opening…"
            onPress={() => Linking.openSettings().catch(() => {})}
          />
        )}
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end", minHeight: 22 },
  intro: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  introPages: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  viewfinder: {
    flex: 1,
    minHeight: 240,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  /* One soft outline: a card, or a nine-pocket page, the same shape. */
  frame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accentMuted,
    borderRadius: radius.control,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  startRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(3),
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
  },
  /* Over the foot, the website's toast: one line, then gone. */
  toast: {
    position: "absolute",
    left: gutter * 2,
    right: gutter * 2,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  door: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(5),
  },
  track: {
    height: 3,
    marginHorizontal: spacing(10),
    marginBottom: spacing(10),
    borderRadius: 2,
    backgroundColor: colors.elevated,
    overflow: "hidden",
  },
  fill: { height: 3, backgroundColor: colors.accent },
  refusal: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  line: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  small: { color: colors.textMuted, fontSize: 12 },
});
