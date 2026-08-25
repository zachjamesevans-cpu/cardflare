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
 * costs one tap, and a refused one must not leave somebody stuck - iOS
 * only offers its dialog once, and "open Settings" is a worse answer
 * than five digits they can type right here.
 *
 * The button says what it is for BEFORE the system dialog appears, so
 * the dialog is the second time they have been asked. That is the whole
 * reason this is a card and not a launch-time prompt.
 *
 * TURNING IT DOWN IS NOT AN ERROR. "No problem - a ZIP code works too"
 * is reassurance, and the first cut printed it in the danger colour
 * because it shared a line with real failures. Red at the exact moment
 * somebody exercises a choice we offered them says they got it wrong.
 * A note and an error are different things and now have different
 * colours, and the note leads rather than trailing the fallback it is
 * introducing.
 */
export function NearbyLocationAsk({ onDone }: { onDone: () => void }) {
  /* Calm: a refusal, or a device with Location Services off. */
  const [note, setNote] = useState<string | null>(null);
  /* Red: something actually went wrong. */
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  /* Only shown once the permission route is closed, so the common path
     stays one button rather than a form. */
  const [typing, setTyping] = useState(false);
  const [settings, setSettings] = useState<"denied" | "services" | null>(null);

  const useDevice = async () => {
    setNote(null);
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
      setSettings("denied");
      setNote("No problem — a ZIP code works too.");
    } else if (outcome.status === "unavailable") {
      setSettings("services");
      setNote("Location Services are off for this device. A ZIP code works too.");
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
      setError(readable(problem));
    }
  };

  return (
    <View style={{ gap: spacing(2.5) }}>
      <Muted>
        cardflare knows about shops whether or not they use it yet. Tell us roughly
        where you are and we&rsquo;ll list the close ones.
      </Muted>

      {/* Above the field it introduces, not below the fallback link. */}
      {note ? <Muted>{note}</Muted> : null}

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
          {/*
           * Not disabled while the field is short. A disabled Button in
           * this kit looks exactly like an enabled one - only `busy`
           * dims it - so disabling would produce a button that appears
           * to work and does nothing, which is worse than a sentence
           * saying what is wrong. The five-digit rule is enforced on
           * the server anyway, and its message is the one worth
           * reading.
           */}
          <AsyncButton label="Show stores" pendingLabel="Saving…" onPress={saveZip} />
          {settings ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 12 }}
              onPress={() => void Linking.openSettings()}
            >
              {settings === "denied"
                ? "Or allow location for cardflare in Settings."
                : "Or turn on Location Services in Settings."}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <AsyncButton
            label="Use my location"
            pendingLabel="Checking…"
            onPress={useDevice}
          />
          <Text
            style={{ color: colors.textMuted, fontSize: 12 }}
            onPress={() => setTyping(true)}
          >
            Or enter a ZIP code instead.
          </Text>
        </>
      )}

      <ErrorLine message={error} />
    </View>
  );
}

/**
 * A failure a player can read.
 *
 * The server's own sentence comes through whenever it sends one - a bad
 * ZIP answers with "We don't know that ZIP code. Check the digits?" and
 * that is the message worth showing. What needs translating is the
 * layer below it, where the strings are `http-404`, `network` and
 * `timeout`.
 *
 * `http-404` in particular is not a bug and not the player's problem:
 * it means this app build is newer than the server it is talking to.
 * TestFlight and Vercel ship on different clocks, so there is always a
 * window where a new screen exists on the phone and its endpoint does
 * not yet exist in the cloud. Seen from the outside, "http-404" reads
 * as broken; the truth is "not yet", and it fixes itself.
 */
function readable(problem: unknown): string {
  const raw = problem instanceof Error ? problem.message : "";

  if (raw === "http-404") {
    return "Saving a ZIP code isn't live yet. Try again after the next update.";
  }
  if (raw === "network" || raw === "timeout") {
    return "No connection. Check your signal and try again.";
  }

  return raw || "Could not save that ZIP code.";
}
