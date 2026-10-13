import { Image } from "expo-image";
import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  containFit,
  cornersMakeAPage,
  dragCorner,
  turnCorners,
  type Point,
  type Quad,
} from "./page-geometry";
import {
  LINE_UP_HINT,
  LINE_UP_PAGE,
  POCKET_NAMES,
  READ_PAGE_AGAIN,
  TURN_PAGE,
} from "./scan-copy";
import { colors, gutter, radius, spacing } from "./theme";
import { Button, ErrorLine, SheetClose, Title } from "./ui";

/**
 * Lining a page up by hand. The founder (2026-10-13): a page the scanner
 * is unsure of is lined up by hand, and it is never guessed. The
 * website's screen in the website's order:
 *
 * - "Line up the page", and the hint: drag the four corners onto the
 *   corners of the binder page.
 * - The page photo as it was shot, four handles on it starting where the
 *   server last put the page (the player's own corners, else the
 *   detector's), the page's outline between them, A1's corner marked.
 * - "Turn": A1 moves to the next corner round, for a page shot on its
 *   side or upside down. The handles stay where they are.
 * - "Read it again": the corners go to the server (A1's first, then
 *   clockwise, as shares of the photo) and the page is read again. Not
 *   pressable while the corners do not make a page, by the website's
 *   own rule (./page-geometry), so a crossed outline never goes up; the
 *   outline is drawn in the danger colour while it does not.
 *
 * The geometry is ./page-geometry's, so tests/unit/page-align-app.test.ts
 * runs it in node.
 */

/** A handle's size: a finger, not a point. */
const HANDLE = 44;

export function PageAlignSheet({
  visible,
  photo,
  size,
  start,
  onRead,
  onClose,
}: {
  visible: boolean;
  /** The page photo as it was shot (the server's link). */
  photo: string;
  /** The photo's own size, for the outline's shape. */
  size: { width: number; height: number };
  /** Where the handles start: the player's own corners, else the page the server found. */
  start: Quad;
  /** "Read it again": resolves once sent; throws with the reason in words. */
  onRead: (corners: Quad) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <Align
          photo={photo}
          size={size}
          start={start}
          onRead={onRead}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function Align({
  photo,
  size,
  start,
  onRead,
  onClose,
}: {
  photo: string;
  size: { width: number; height: number };
  start: Quad;
  onRead: (corners: Quad) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [corners, setCorners] = useState<Quad>(start);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Read inside the responders, which are made once. */
  const now = useRef(corners);
  now.current = corners;
  const drawnNow = useRef({ width: 1, height: 1 });
  const from = useRef<Point>({ x: 0, y: 0 });

  /* The photo drawn inside the stage less half a handle all round, so a
     handle on the photo's very corner is still whole and still a target. */
  const fitted = box
    ? containFit(
        {
          width: Math.max(1, box.width - HANDLE),
          height: Math.max(1, box.height - HANDLE),
        },
        size,
      )
    : null;
  const drawn = fitted
    ? { ...fitted, x: fitted.x + HANDLE / 2, y: fitted.y + HANDLE / 2 }
    : null;
  if (drawn) drawnNow.current = drawn;

  /* One responder per handle, by its place in the array: Turn changes
     which corner is A1, not which handle is under the finger. */
  const handles = useMemo(
    () =>
      [0, 1, 2, 3].map((at) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            from.current = now.current[at];
          },
          onPanResponderMove: (_, gesture) => {
            const moved = dragCorner(
              from.current,
              gesture.dx,
              gesture.dy,
              drawnNow.current,
            );
            setCorners((current) => {
              const next = [...current] as Quad;
              next[at] = moved;
              return next;
            });
          },
        }),
      ),
    [],
  );

  const makesAPage = cornersMakeAPage(corners);
  const onScreen = (point: Point) =>
    drawn
      ? { x: drawn.x + point.x * drawn.width, y: drawn.y + point.y * drawn.height }
      : { x: 0, y: 0 };

  const read = async () => {
    if (busy || !makesAPage) return;
    setBusy(true);
    setError(null);
    try {
      await onRead(corners);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: insets.top + spacing(3),
        paddingBottom: insets.bottom + spacing(3),
        paddingHorizontal: gutter,
        gap: spacing(3),
      }}
    >
      <View style={styles.top}>
        <Title>{LINE_UP_PAGE}</Title>
        <SheetClose onPress={onClose} />
      </View>
      <Text style={styles.hint}>{LINE_UP_HINT}</Text>

      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBox({ width, height });
        }}
      >
        {drawn ? (
          <>
            <Image
              source={{ uri: photo }}
              contentFit="fill"
              accessibilityIgnoresInvertColors
              style={{
                position: "absolute",
                left: drawn.x,
                top: drawn.y,
                width: drawn.width,
                height: drawn.height,
              }}
            />
            {corners.map((corner, at) => (
              <Edge
                key={`edge-${at}`}
                from={onScreen(corner)}
                to={onScreen(corners[(at + 1) % 4])}
                good={makesAPage}
              />
            ))}
            {corners.map((corner, at) => {
              const point = onScreen(corner);
              const first = at === 0;
              return (
                <View
                  key={`handle-${at}`}
                  {...handles[at].panHandlers}
                  accessible
                  accessibilityLabel={first ? POCKET_NAMES[0] : undefined}
                  style={[
                    styles.handle,
                    { left: point.x - HANDLE / 2, top: point.y - HANDLE / 2 },
                  ]}
                >
                  <View style={[styles.dot, first && styles.dotFirst]}>
                    {first ? <Text style={styles.first}>{POCKET_NAMES[0]}</Text> : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </View>

      <ErrorLine message={error} />
      <Button
        label={TURN_PAGE}
        variant="secondary"
        disabled={busy}
        onPress={() => setCorners((current) => turnCorners(current))}
      />
      <Button
        label={READ_PAGE_AGAIN}
        busy={busy}
        disabled={!makesAPage}
        onPress={() => void read()}
      />
    </View>
  );
}

/** One side of the page's outline: a thin bar from corner to corner. */
function Edge({ from, to, good }: { from: Point; to: Point; good: boolean }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - 1,
        width: length,
        height: 2,
        backgroundColor: good ? colors.accent : colors.danger,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
  },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  stage: {
    flex: 1,
    minHeight: 240,
    borderRadius: radius.card,
    overflow: "hidden",
    get backgroundColor() {
      return colors.surface;
    },
  },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    get borderColor() {
      return colors.accent;
    },
    get backgroundColor() {
      return colors.scrim;
    },
  },
  /* A1's corner: filled, and named. */
  dotFirst: {
    width: 30,
    height: 30,
    borderRadius: 15,
    get backgroundColor() {
      return colors.accent;
    },
  },
  first: { color: colors.accentContrast, fontSize: 11, fontWeight: "800" },
});
