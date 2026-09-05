import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { rememberRoom, rememberRoomGame } from "../api";

import { AsyncButton, Body, Card, Title } from "../ui";
import { colors, spacing } from "../theme";

/**
 * The QR scanner. A cardflare code arrives as a URL (cardflare.gg/e/CODE)
 * from the printed poster; anything else scanned is ignored rather than
 * guessed at. First scan wins — the camera keeps firing events after a
 * hit, and navigating twice would stack two room screens.
 */
export function ScanScreen({ onCode }: { onCode: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const fired = useRef(false);

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

          const match = /\/e\/([A-Za-z0-9]+)/.exec(data);
          const code = match?.[1] ?? (/^[A-Za-z0-9]{4,10}$/.test(data) ? data : null);
          if (!code) return;

          /* A tournament screen's code carries its game (?g=one-piece),
             and card search in that room narrows to it. Absent means
             the counter's universal code — and clears any old scope. */
          const game = /[?&]g=([a-z][a-z0-9-]{1,30})/.exec(data)?.[1] ?? null;

          fired.current = true;
          // Remembered before navigating so the Room tab finds it.
          void Promise.all([rememberRoom(code.toUpperCase()), rememberRoomGame(game)])
            .then(() => onCode(code.toUpperCase()))
            .catch(() => {
              /* The keychain refused; let the next scan try again
                 rather than leaving the camera deaf. */
              fired.current = false;
            });
        }}
      />
      <View style={styles.hint}>
        <Body>Point at the code on the counter.</Body>
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
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
  },
});
