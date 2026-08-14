import { useState } from "react";
import { ActivityIndicator, Text } from "react-native";

import { toggleFollow, type FollowState } from "./api";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * Follow, Following, or Trade partners - option C's one button, the
 * website's follow-button in the app's shape. Tapping toggles only the
 * viewer's own edge; mutuality is the server's verdict, returned with
 * the toggle so the label settles without a second read.
 */
export function FollowButton({
  playerId,
  initial,
}: {
  playerId: string;
  /** Null hides the button: guests and your own profile. */
  initial: FollowState | null;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  const label = state.partners
    ? "Trade partners"
    : state.following
      ? "Following"
      : state.followsYou
        ? "Follow back"
        : "Follow";

  return (
    <Tap
      disabled={busy}
      onPress={() => {
        setBusy(true);
        toggleFollow(playerId, state.following)
          .then((result) => setState(result.follow))
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: state.following ? colors.border : `${colors.accent}66`,
        backgroundColor: state.following ? colors.elevated : `${colors.accent}1a`,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1.5),
      }}
    >
      {busy && <ActivityIndicator size="small" color={colors.accent} />}
      <Text
        style={{
          color: state.following ? colors.textSecondary : colors.accent,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}
