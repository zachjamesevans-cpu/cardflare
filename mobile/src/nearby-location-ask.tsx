import { useState } from "react";
import { Linking, Text, View } from "react-native";

import { savePostalCode } from "./api";
import { requestCoords } from "./location";
import { colors, spacing } from "./theme";
import { AsyncButton, ErrorLine, Input, Muted } from "./ui";

/**
 * Asking a player where they are, on a phone.
 *
 * The founder's correction, in full: "it should be asking for location
 * permissions to find stores near them, or at the very least asking for
 * a zip code of their address. nothing to do with 'my store', because
 * most of this is customer/player facing."
 *
 * So the permission comes first and the ZIP is always there under it.
 * The order matters both ways round: a granted position is exact and
 * costs one tap, and a refused one must not leave somebody stuck — iOS
 * only offers its dialog once, and "open Settings" is a worse answer
 * than five digits they can type right here.
 *
 * The button says what it is for BEFORE the system dialog appears, so
 * the dialog is the second time they have been asked. That is the whole
 * reason this is a card and not a launch-time prompt.
 */
export function NearbyLocationAsk({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  /* Only shown once the permission route is closed, so the common path
     stays one button rather than a form. */
  const [typing, setTyping] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const useDevice = async () => {
    setError(null);
    const outcome = await requestCoords();

    if (outcome.status === "granted") {
      onDone();
      return;
    }

    /* Every failure ends with the ZIP field open. A dead end here is a
       player who never sees the feature again. */
    setTyping(true);

    if (outcome.status === "denied") {
      setBlocked(true);
      setError("No problem — a ZIP code works too.");
    } else if (outcome.status === "unavailable") {
      setError("Location Services are off for this device. A ZIP code works too.");
    } else {
      setError(outcome.message);
    }
  };

  const saveZip = async () => {
    setError(null);

    try {
      await savePostalCode(zip);
      onDone();
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Could not save that ZIP code.",
      );
    }
  };

  return (
    <View style={{ gap: spacing(2.5) }}>
      <Muted>
        CardFlare knows about shops whether or not they use it yet. Tell us roughly
        where you are and we&rsquo;ll list the close ones.
      </Muted>

      {!typing && (
        <AsyncButton
          label="Use my location"
          pendingLabel="Checking…"
          onPress={useDevice}
        />
      )}

      {typing ? (
        <View style={{ gap: spacing(2) }}>
          <Input
            value={zip}
            onChangeText={setZip}
            placeholder="ZIP code"
            keyboardType="number-pad"
            maxLength={5}
            textContentType="postalCode"
            accessibilityLabel="ZIP code"
          />
          <AsyncButton
            label="Show stores"
            pendingLabel="Saving…"
            onPress={saveZip}
            disabled={zip.trim().length < 5}
          />
          {blocked && (
            <Text
              style={{ color: colors.textMuted, fontSize: 12 }}
              onPress={() => void Linking.openSettings()}
            >
              Or turn location on in Settings.
            </Text>
          )}
        </View>
      ) : (
        <Text
          style={{ color: colors.textMuted, fontSize: 12 }}
          onPress={() => setTyping(true)}
        >
          Or enter a ZIP code instead.
        </Text>
      )}

      <ErrorLine message={error} />
    </View>
  );
}
