import { useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { followStore, removeLocal } from "./api";
import { markFeedStale } from "./feed-refresh";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * Follow, or Following: the website's follow-store-button in the app's
 * shape, the same two words.
 *
 * Flips the moment it is tapped and settles on what the server says,
 * so a tap at a counter on bad wifi reads as done rather than stuck;
 * a failed write puts the old word back. A follow is a Feed item from
 * then on, so the Feed is told it is stale the way a posted Flare
 * tells it.
 *
 * Rendered only for a signed-in account. The screen decides what a
 * guest sees instead ("Sign in to follow"), because a button that
 * cannot work is a lie.
 */
export function FollowStoreButton({
  storeId,
  initial,
  size = "full",
}: {
  storeId: string;
  /** Whether the player already follows this store. */
  initial: boolean;
  /** `chip` sits beside a store's name in a room; `full` is the page's button. */
  size?: "chip" | "full";
}) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = () => {
    if (busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    const write: Promise<boolean> = next
      ? followStore(storeId).then((result) => result.following)
      : removeLocal(storeId).then(() => false);
    write
      .then((settled) => {
        setFollowing(settled);
        markFeedStale();
      })
      .catch(() => setFollowing(!next))
      .finally(() => setBusy(false));
  };

  const chip = size === "chip";

  return (
    <Tap
      disabled={busy}
      onPress={toggle}
      accessibilityLabel={following ? "Following" : "Follow"}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1),
        borderRadius: chip ? 999 : radius.control,
        borderWidth: 1,
        borderColor: following ? colors.border : `${colors.accent}66`,
        backgroundColor: following ? colors.elevated : `${colors.accent}1a`,
        paddingHorizontal: chip ? spacing(2) : spacing(3),
        paddingVertical: chip ? spacing(0.75) : spacing(1.5),
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <MaterialCommunityIcons
          name={following ? "check" : "plus"}
          size={chip ? 14 : 16}
          color={following ? colors.textSecondary : colors.accent}
        />
      )}
      <Text
        style={{
          color: following ? colors.textSecondary : colors.accent,
          fontWeight: "600",
          fontSize: chip ? 12 : 13,
        }}
      >
        {following ? "Following" : "Follow"}
      </Text>
    </Tap>
  );
}
