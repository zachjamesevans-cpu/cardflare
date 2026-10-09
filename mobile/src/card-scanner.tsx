import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ApiError,
  type CardHit,
  type ScanMatch,
  type ScanRead,
  describeError,
  scanCardPhoto,
} from "./api";
import { RemoteImage } from "./remote-image";
import {
  ADD_TO_BINDER,
  IS_THIS_IT,
  NOT_SURE,
  OTHER_MATCHES,
  READING_CARD,
  SCAN_AGAIN,
  SCAN_HINT,
  SCAN_MAX_BYTES,
  SCAN_NEXT,
  SCAN_REFUSALS,
  TAKE_PHOTO,
  scanReadLine,
  type ScanRefusal,
} from "./scan-copy";
import { frameInPhoto, guideFrame, scanResize } from "./scan-frame";
import { scanHit } from "./scan-hit";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Body, Button, Loading, Muted, Tap } from "./ui";

/**
 * The card scanner, inside the binder's add menu. The website's steps
 * in the website's order (src/components/cards/scan-card.tsx):
 *
 * a. The camera, a card-shaped frame, the hint, "Take photo".
 * b. The frame's part of the photo, cut out and shrunk to the website's
 *    size, goes up in pieces: "Reading the card..." and the spinner.
 * c. "Is this it?": the best guess large, its printing chosen when the
 *    set code named one, the other guesses in a row to swap in. "Add to
 *    binder" puts it in the menu's tray, the same tray the search fills,
 *    so a run of scans builds one batch the menu's own button commits.
 *    "Try again" if it is not the card; once it is in, "Scan the next
 *    card" back to the camera.
 * d. A refusal in its own words, and "Try again". A card read but not
 *    found hands its name to the menu's search, to find it by hand.
 *
 * The camera is asked for here and nowhere else: this only mounts when
 * the player taps "Scan a card", and that tap is the consent to ask.
 */

type Step =
  | { kind: "camera" }
  | { kind: "reading" }
  | {
      kind: "result";
      read: ScanRead;
      matches: ScanMatch[];
      top: number;
      printingId: string | null;
      added: boolean;
      /** The careful reader's second look: false when it was not sure. */
      sure?: boolean;
      note?: string;
    }
  | { kind: "refused"; reason: ScanRefusal };

/** How long the read runs before the quiet progress line shows. */
const SLOW_MS = 1500;

/**
 * The frame's part of the photo, its long side at SCAN_LONG_EDGE, as
 * base64 JPEG. Quality walks down only if a photo would still be over
 * the server's ceiling, which at this size it should never be.
 */
async function shrinkPhoto(
  photo: { uri: string; width: number; height: number },
  view: { width: number; height: number },
): Promise<string | null> {
  const crop = frameInPhoto(guideFrame(view.width, view.height), view, photo);
  let quality = 0.6;
  while (quality >= 0.3) {
    const out = await manipulateAsync(
      photo.uri,
      [{ crop }, { resize: scanResize(crop) }],
      { compress: quality, format: SaveFormat.JPEG, base64: true },
    );
    const encoded = out.base64 ?? null;
    if (encoded && (encoded.length * 3) / 4 <= SCAN_MAX_BYTES) return encoded;
    quality -= 0.15;
  }
  return null;
}

export function CardScanner({
  onAdd,
  onNotFound,
}: {
  /** Into the menu's tray: one copy, or one more if it is there already. */
  onAdd: (hit: CardHit, printingId: string | null) => void;
  /** A card read but not found: what to put in the menu's search. */
  onNotFound: (query: string) => void;
}) {
  const camera = useRef<CameraView>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [step, setStep] = useState<Step>({ kind: "camera" });
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);
  /* The shutter is open: the camera stays on screen until the photo is
     taken, because taking it from a camera already unmounted fails. */
  const [capturing, setCapturing] = useState(false);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /* The progress line only once the wait is a wait. */
  useEffect(() => {
    if (step.kind !== "reading") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [step.kind]);

  const shoot = async () => {
    if (!camera.current || !view || step.kind !== "camera" || capturing) return;
    setProgress(0);
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!alive.current) return;
      setCapturing(false);
      setStep({ kind: "reading" });
      const encoded = await shrinkPhoto(photo, view);
      if (!encoded) {
        if (alive.current) setStep({ kind: "refused", reason: "too-big" });
        return;
      }
      const outcome = await scanCardPhoto(encoded, (sent, total) => {
        if (alive.current) setProgress(sent / total);
      });
      if (!alive.current) return;
      if (outcome.ok) {
        setStep({
          kind: "result",
          read: outcome.read,
          matches: outcome.matches,
          top: 0,
          printingId: outcome.matches[0]?.printingId ?? null,
          added: false,
          sure: outcome.sure,
          note: outcome.note,
        });
        return;
      }
      if (outcome.reason === "not-found" && outcome.read) {
        const name = outcome.read.englishName || outcome.read.name;
        if (name) onNotFound(name);
      }
      setStep({ kind: "refused", reason: outcome.reason });
    } catch (caught) {
      /* The website's words for a scan that broke on the way: the cause
         goes to the log, the player hears the scanner is down. */
      console.warn("[cardflare] card scan failed", describeError(caught));
      if (!alive.current) return;
      setCapturing(false);
      setStep({
        kind: "refused",
        reason:
          caught instanceof ApiError && caught.status === 429 ? "limit" : "unavailable",
      });
    }
  };

  const again = () => setStep({ kind: "camera" });

  if (step.kind === "reading") {
    return (
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
  }

  if (step.kind === "refused") {
    return (
      <View style={{ flex: 1, justifyContent: "center", gap: spacing(3) }}>
        <Text accessibilityLiveRegion="polite" style={styles.refusal}>
          {SCAN_REFUSALS[step.reason]}
        </Text>
        <Button label={SCAN_AGAIN} variant="secondary" onPress={again} />
      </View>
    );
  }

  if (step.kind === "result") {
    const match = step.matches[step.top];
    if (!match) return null;
    const hit = scanHit(match.card, step.printingId);
    const art =
      hit.printings.find((printing) => printing.id === step.printingId)?.imageUrl ??
      hit.printings.find((printing) => printing.id === hit.basePrintingId)?.imageUrl ??
      null;
    const line = scanReadLine(step.read);
    const others = step.matches
      .map((each, at) => ({ each, at }))
      .filter(({ at }) => at !== step.top);
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing(4), paddingBottom: spacing(4) }}
      >
        {/* What was read, small, so a misread is plain to see; under
            it, when the careful reader took a second look, whether it
            was sure and how it decided. */}
        {line || step.sure === false || step.note ? (
          <View style={{ gap: spacing(1) }}>
            {line ? <Text style={styles.small}>{line}</Text> : null}
            {step.sure === false ? <Text style={styles.unsure}>{NOT_SURE}</Text> : null}
            {step.note ? <Text style={styles.small}>{step.note}</Text> : null}
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.heading}>
          {IS_THIS_IT}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(4) }}
        >
          <RemoteImage
            uri={art}
            contentFit="cover"
            accessibilityLabel={`${hit.name}, ${hit.cardNumber}`}
            style={{
              width: 144,
              height: Math.round((144 * 88) / 63),
              borderRadius: 6,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={styles.name}>{hit.name}</Text>
            <Text style={styles.number}>{hit.cardNumber}</Text>
          </View>
        </View>

        {/* Which printing: preselected when the set code on the card
            named one, "Any printing" otherwise. Gone once it is in the
            tray, as on the website. */}
        {!step.added && hit.printings.length > 1 ? (
          <PrintingChips
            printings={hit.printings}
            value={step.printingId}
            onChange={(printingId) => setStep({ ...step, printingId })}
          />
        ) : null}

        {!step.added && others.length > 0 ? (
          <View style={{ gap: spacing(2) }}>
            <Text style={styles.small}>{OTHER_MATCHES}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing(2) }}
            >
              {others.map(({ each, at }) => {
                const other = scanHit(each.card, null);
                const otherArt =
                  other.printings.find((p) => p.id === other.basePrintingId)
                    ?.imageUrl ?? null;
                return (
                  <Tap
                    key={each.card.id}
                    onPress={() =>
                      setStep({ ...step, top: at, printingId: each.printingId })
                    }
                    accessibilityLabel={`${other.name}, ${other.cardNumber}`}
                    style={{ width: 60, gap: spacing(1) }}
                  >
                    <RemoteImage
                      uri={otherArt}
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

        {/* In the tray, the only way on is the next card. */}
        {step.added ? (
          <Button label={SCAN_NEXT} onPress={again} />
        ) : (
          <View style={{ gap: spacing(2) }}>
            <Button
              label={ADD_TO_BINDER}
              onPress={() => {
                onAdd(hit, step.printingId);
                setStep({ ...step, added: true });
              }}
            />
            <Button label={SCAN_AGAIN} variant="secondary" onPress={again} />
          </View>
        )}
      </ScrollView>
    );
  }

  /* Step a: the camera, once it may be used. */
  const frame = view ? guideFrame(view.width, view.height) : null;
  return (
    <CameraAllowed>
      <View style={{ flex: 1, gap: spacing(3), paddingBottom: spacing(3) }}>
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
        <Muted>{SCAN_HINT}</Muted>
        <Button
          label={TAKE_PHOTO}
          busy={capturing}
          disabled={!view}
          onPress={() => void shoot()}
        />
      </View>
    </CameraAllowed>
  );
}

/**
 * The camera, once it may be used; asked for once, the moment the scan
 * tab opens. The tap on "Scan a card" is the reason, so the system's
 * sheet arrives with its context. One card or a whole page, the camera
 * is asked for here and nowhere else.
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

/**
 * Which printing: "Any printing" and every version as a chip, the one
 * the set code named already on. The single scan's and a scanned
 * pocket's, the same chips.
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Printing"
      contentContainerStyle={{ gap: spacing(2) }}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    flex: 1,
    minHeight: 240,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  frame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.control,
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
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
  number: { color: colors.textMuted, fontSize: 14, fontVariant: ["tabular-nums"] },
  small: { color: colors.textMuted, fontSize: 12 },
  unsure: { color: colors.warning, fontSize: 13, fontWeight: "600" },
  tiny: { color: colors.textMuted, fontSize: 10 },
});
