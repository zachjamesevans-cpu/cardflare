import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { StyleSheet, View } from "react-native";

import { rememberRoom } from "../api";

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
          <AsyncButton
          label="Allow camera"
          pendingLabel="Asking…"
          onPress={() => requestPermission()}
        />
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

          fired.current = true;
          // Remembered before navigating so the Room tab finds it.
          void rememberRoom(code.toUpperCase()).then(() => onCode(code.toUpperCase()));
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
