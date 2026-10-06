import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { forgetRoom, rememberRoom, rememberRoomGame } from "../api";
import { openRoom } from "../open-room";
import { FOREIGN_CODE, readScannedCode } from "../scan-code";

import { AsyncButton, Body, Button, Card, Title } from "../ui";
import { colors, spacing } from "../theme";

/** How long "That isn't a cardflare code" stays up after a foreign scan. */
const FOREIGN_NOTICE_MS = 2500;

/**
 * The QR scanner. A cardflare code arrives as a URL (cardflare.gg/e/CODE)
 * from the printed poster, or as a bare code; anything else is refused
 * by name (src/scan-code.ts) rather than guessed at. First scan wins —
 * the camera keeps firing events after a hit, and navigating twice would
 * stack two room screens — and coming back to the screen (Back from the
 * room) re-arms it, or the camera would sit there deaf.
 */
export function ScanScreen({ onCode }: { onCode: (code: string) => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [permission, requestPermission] = useCameraPermissions();
  const fired = useRef(false);
  const [foreign, setForeign] = useState(false);
  const foreignTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      fired.current = false;
    }, []),
  );

  useEffect(
    () => () => {
      if (foreignTimer.current) clearTimeout(foreignTimer.current);
    },
    [],
  );

  const enterCode = () => {
    /* The Room with no remembered code is the code form: the same door
       Nights' "Enter event code" uses. */
    void forgetRoom()
      .catch(() => {})
      .finally(() => openRoom(navigation));
  };

  if (!permission?.granted) {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>Camera access</Title>
          <Body>
            The camera is only used to read the code on the store&rsquo;s counter.
          </Body>
          {permission && !permission.canAskAgain ? (
            /* iOS asks once. After a refusal the only way back is the
               Settings app, so the button has to go there rather than
               call a prompt that will never show again. */
            <AsyncButton
              label="Open Settings"
              pendingLabel="Opening…"
              onPress={() => Linking.openSettings().catch(() => {})}
            />
          ) : (
            <AsyncButton
              label="Allow camera"
              pendingLabel="Asking…"
              onPress={() => requestPermission()}
            />
          )}
          <Button label="Enter a code instead" variant="secondary" onPress={enterCode} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (fired.current) return;

          const scanned = readScannedCode(data);
          if (scanned.kind === "foreign") {
            /* The camera reports the same code many times a second, so
               the notice is held for a moment rather than flickered. */
            setForeign(true);
            if (foreignTimer.current) clearTimeout(foreignTimer.current);
            foreignTimer.current = setTimeout(() => setForeign(false), FOREIGN_NOTICE_MS);
            return;
          }

          setForeign(false);
          fired.current = true;
          // Remembered before navigating so the Room tab finds it.
          void Promise.all([rememberRoom(scanned.code), rememberRoomGame(scanned.game)])
            .then(() => onCode(scanned.code))
            .catch(() => {
              /* The keychain refused; let the next scan try again
                 rather than leaving the camera deaf. */
              fired.current = false;
            });
        }}
      />
      <View style={styles.hint}>
        {foreign ? (
          <Text style={styles.foreign} accessibilityLiveRegion="polite">
            {FOREIGN_CODE}
          </Text>
        ) : (
          <Body>Point at the code on the counter.</Body>
        )}
        <Button label="Enter a code instead" variant="secondary" onPress={enterCode} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hint: {
    position: "absolute",
    bottom: spacing(10),
    alignSelf: "center",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
  },
  foreign: { color: colors.danger, fontSize: 15, fontWeight: "600" },
});
