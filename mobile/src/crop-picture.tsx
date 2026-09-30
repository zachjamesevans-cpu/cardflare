import { Image } from "expo-image";
import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PictureKind } from "./change-picture";
import { cropFor, drawFor, type CropBox } from "./crop-box";
import { RemoteImage } from "./remote-image";
import { colors, gutter, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The crop, with the profile underneath it.
 *
 * The founder: "showing a 'phantom' view of their profile and they can
 * crop it with that UI so they can see exactly what it'll look like
 * with their profile." So the top half is the picture, pinched and
 * dragged inside a frame the shape the server will cut; the bottom
 * half is the profile block as the profile tab draws it, with the crop
 * drawn live into the picture circle or the cover band. Move the top,
 * the bottom follows: what you see is what everyone gets.
 *
 * Same arithmetic as the website's cropper (crop-box.ts); what goes to
 * the server is the crop in the picture's own pixels, so the server's
 * resize is a resize and nothing more.
 */

/** The profile block's geometry, copied from screens/profile.tsx. */
const COVER_HEIGHT = 144;
const HEADER_TOP = 60;
const AVATAR = 88;
const CARD_PAD = spacing(4);

/** What the crop is for and what the preview needs to draw the rest. */
export interface CropSubject {
  kind: PictureKind;
  uri: string;
  width: number;
  height: number;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  coverUrl: string | null;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function CropSheet({
  subject,
  onCancel,
  onDone,
}: {
  subject: CropSubject | null;
  onCancel: () => void;
  onDone: (crop: CropBox) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const frameWidth = screen - gutter * 2;
  const aspect = subject?.kind === "cover" ? 4 / 3 : 1;
  const frameHeight = Math.round(frameWidth / aspect);

  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });

  /* Gesture bookkeeping lives in refs so the responder callbacks, made
     once, always read the latest values. */
  const live = useRef({ zoom: 1, centre: { x: 0.5, y: 0.5 } });
  const grip = useRef<{ x: number; y: number; distance: number | null; zoom: number }>({
    x: 0,
    y: 0,
    distance: null,
    zoom: 1,
  });

  const source = subject ? { width: subject.width, height: subject.height } : null;
  const crop = useMemo(
    () => (source ? cropFor(source.width, source.height, aspect, zoom, centre) : null),
    [source?.width, source?.height, aspect, zoom, centre],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          grip.current = {
            x: touches[0]?.pageX ?? 0,
            y: touches[0]?.pageY ?? 0,
            distance: touches.length >= 2 ? spread(touches) : null,
            zoom: live.current.zoom,
          };
        },
        onPanResponderMove: (event) => {
          if (!source) return;
          const touches = event.nativeEvent.touches;
          const current = cropFor(
            source.width,
            source.height,
            aspect,
            live.current.zoom,
            live.current.centre,
          );

          if (touches.length >= 2) {
            /* Pinch: the zoom follows the fingers' spread, from the
               spread they started at. A first second finger sets the
               baseline instead of jumping. */
            const distance = spread(touches);
            if (grip.current.distance === null) {
              grip.current.distance = distance;
              grip.current.zoom = live.current.zoom;
              return;
            }
            const next = Math.min(
              MAX_ZOOM,
              Math.max(
                MIN_ZOOM,
                (grip.current.zoom * distance) / grip.current.distance,
              ),
            );
            live.current.zoom = next;
            setZoom(next);
            return;
          }

          /* Drag: the picture tracks the finger at every zoom, so a
             finger's width of movement is a finger's width of picture. */
          const touch = touches[0];
          if (!touch) return;
          if (grip.current.distance !== null) {
            /* Second finger lifted: re-anchor so the picture does not leap. */
            grip.current.distance = null;
            grip.current.x = touch.pageX;
            grip.current.y = touch.pageY;
            return;
          }
          const dx = touch.pageX - grip.current.x;
          const dy = touch.pageY - grip.current.y;
          grip.current.x = touch.pageX;
          grip.current.y = touch.pageY;
          const next = {
            x: live.current.centre.x - (dx / frameWidth) * current.width,
            y: live.current.centre.y - (dy / frameHeight) * current.height,
          };
          live.current.centre = next;
          setCentre(next);
        },
        onPanResponderRelease: () => {
          grip.current.distance = null;
        },
      }),
    [aspect, frameWidth, frameHeight, source?.width, source?.height],
  );

  if (!subject || !crop) return null;

  const drawn = drawFor(crop, frameWidth, frameHeight);
  const cover = subject.kind === "cover";

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, spacing(4)),
          paddingHorizontal: gutter,
          gap: spacing(4),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: spacing(3),
          }}
        >
          <Tap onPress={onCancel} hitSlop={8} accessibilityLabel="Cancel">
            <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Cancel</Text>
          </Tap>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
            {cover ? "Crop your cover" : "Crop your picture"}
          </Text>
          <Tap onPress={() => onDone(crop)} hitSlop={8} accessibilityLabel="Done">
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>
              Done
            </Text>
          </Tap>
        </View>

        {/* The frame: the picture, moved under a window the shape the
            server will cut. A circle window for the picture, because a
            circle is what everyone sees. */}
        <View
          {...responder.panHandlers}
          style={{
            width: frameWidth,
            height: frameHeight,
            borderRadius: radius.card,
            overflow: "hidden",
            backgroundColor: colors.elevated,
          }}
        >
          <Image
            source={{ uri: subject.uri }}
            contentFit="fill"
            style={{
              position: "absolute",
              width: drawn.width,
              height: drawn.height,
              left: drawn.left,
              top: drawn.top,
            }}
          />
          {!cover ? (
            /* A ring whose border darkens everything outside the circle:
               the one way to cut a round hole in a View without a mask. */
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -frameWidth,
                top: -frameWidth,
                width: frameWidth * 3,
                height: frameWidth * 3,
                borderRadius: frameWidth * 1.5,
                borderWidth: frameWidth,
                borderColor: "rgba(0,0,0,0.55)",
              }}
            />
          ) : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
          Drag to move. Pinch to zoom.
        </Text>

        {/* The phantom: the profile block, with the crop drawn in. */}
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
          How it looks on your profile
        </Text>
        <View
          style={{
            width: frameWidth,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: "hidden",
            paddingTop: spacing(6),
            paddingHorizontal: CARD_PAD,
            paddingBottom: spacing(4),
          }}
        >
          {/* The cover band: the crop, or the cover already there. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: COVER_HEIGHT,
              overflow: "hidden",
              backgroundColor: colors.elevated,
            }}
          >
            {cover ? (
              <Cropped
                uri={subject.uri}
                crop={crop}
                width={frameWidth}
                height={Math.round((frameWidth * 3) / 4)}
              />
            ) : (
              <RemoteImage
                uri={subject.coverUrl}
                style={{ width: "100%", height: "100%" }}
                contentPosition="top"
              />
            )}
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.25)",
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: COVER_HEIGHT / 2,
                bottom: 0,
                backgroundColor: colors.surface,
                opacity: 0.75,
              }}
            />
          </View>

          <View style={{ marginTop: HEADER_TOP, gap: spacing(3) }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
            >
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  overflow: "hidden",
                  backgroundColor: colors.elevated,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
              >
                {cover ? (
                  <RemoteImage
                    uri={subject.avatarUrl}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <Cropped
                    uri={subject.uri}
                    crop={crop}
                    width={AVATAR}
                    height={AVATAR}
                  />
                )}
              </View>
              {[
                ["Flares", "0"],
                ["followers", "0"],
                ["following", "0"],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: spacing(2),
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.elevated,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {value}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            <View>
              <Text
                style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "800" }}
              >
                {subject.displayName}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                @{subject.handle}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The crop, drawn into a box of the given size: the frame, smaller. */
function Cropped({
  uri,
  crop,
  width,
  height,
}: {
  uri: string;
  crop: CropBox;
  width: number;
  height: number;
}) {
  const drawn = drawFor(crop, width, height);
  return (
    <Image
      source={{ uri }}
      contentFit="fill"
      style={{
        position: "absolute",
        width: drawn.width,
        height: drawn.height,
        left: drawn.left,
        top: drawn.top,
      }}
    />
  );
}

function spread(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}
