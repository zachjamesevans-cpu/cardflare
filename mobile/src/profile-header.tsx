import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Share, Text, View } from "react-native";

import type { ProfileStats } from "./api";
import { API_BASE } from "./config";
import { EmberBadge } from "./ember-badge";
import { formatHandle } from "./handle";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";
import { WornBadge, WornName, WornTitle } from "./worn-name";

/**
 * The top of a profile, laid out the way Instagram lays one out: the
 * website's ProfileHeader, natively.
 *
 * The founder: "as close to Instagram as possible. Followers,
 * following, Flares instead of post count, with the same buttons for
 * edit profile and share profile." So: the picture on the left with
 * the three numbers beside it, the name and handle under, then a row
 * of buttons the full width of the block. The same header for your own
 * profile and for anybody else's; only the buttons differ.
 */
export function ProfileHeader({
  avatar,
  name,
  handle,
  equips,
  embersEarned,
  stats,
  onFollowers,
  onFollowing,
  actions,
}: {
  /** The picture, already dressed. */
  avatar: ReactNode;
  name: string;
  handle: string;
  /** The name style, badge and title worn from the catalogue. */
  equips: { nameplate?: string | null; badge?: string | null; title?: string | null };
  embersEarned: number;
  /** Absent from an older server: the row shows dashes rather than lying. */
  stats: ProfileStats | undefined;
  /** Where the followers and following numbers go, on a profile that lists them. */
  onFollowers?: () => void;
  onFollowing?: () => void;
  /** The button row: edit and share, or follow and share. */
  actions: ReactNode;
}) {
  return (
    <View style={{ gap: spacing(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(4) }}>
        {avatar}
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Stat value={stats?.flares} label={stats?.flares === 1 ? "Flare" : "Flares"} />
          <Stat value={stats?.followers} label="followers" onPress={onFollowers} />
          <Stat value={stats?.following} label="following" onPress={onFollowing} />
        </View>
      </View>

      <View style={{ gap: spacing(1.5), alignItems: "flex-start" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <WornName
            name={name}
            nameplate={equips.nameplate}
            baseStyle={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}
          />
          <WornBadge badge={equips.badge} />
        </View>
        <WornTitle title={equips.title} />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{formatHandle(handle)}</Text>
        <EmberBadge earned={embersEarned} size="sm" />
      </View>

      <View style={{ flexDirection: "row", gap: spacing(2) }}>{actions}</View>
    </View>
  );
}

/** One number over its label, tappable when there is a list behind it. */
function Stat({
  value,
  label,
  onPress,
}: {
  value: number | undefined;
  label: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "700" }}>
        {value === undefined ? "–" : value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </>
  );
  const style = { flex: 1, alignItems: "center" as const };
  return onPress ? (
    <Tap onPress={onPress} accessibilityLabel={`${label} list`} style={style}>
      {body}
    </Tap>
  ) : (
    <View style={style}>{body}</View>
  );
}

/**
 * A header button: half the row, the secondary shape. Two of them
 * make Instagram's Edit profile / Share profile pair.
 */
export function HeaderButton({
  label,
  icon,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing(1.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: primary ? colors.accent : colors.border,
        backgroundColor: primary ? colors.accent : colors.elevated,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={15}
          color={primary ? colors.accentContrast : colors.textPrimary}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          color: primary ? colors.accentContrast : colors.textPrimary,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}

/** The profile's public address, the one Share profile hands out. */
export function profileUrl(playerId: string): string {
  return `${API_BASE}/p/${encodeURIComponent(playerId)}`;
}

/** Share profile: the system sheet with the profile's address. */
export function ShareProfileButton({ playerId, name }: { playerId: string; name: string }) {
  return (
    <HeaderButton
      label="Share profile"
      icon="share-outline"
      onPress={() => {
        void Share.share({
          message: profileUrl(playerId),
          url: profileUrl(playerId),
          title: `${name} on cardflare`,
        }).catch(() => {
          /* The sheet was dismissed, or refused. Nothing more to offer. */
        });
      }}
    />
  );
}
