import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { FollowedPlayer } from "./api";
import { PlayerAvatar } from "./player-avatar";
import { Muted, Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * The lists behind a profile's followers and following numbers, on
 * your own profile and on anybody else's. The founder: "a separate
 * pop up", not a section at the bottom of the page.
 */

/** Followers or following, in a modal over the profile: the website's PeopleDialog. */
export function PeopleSheet({
  which,
  people,
  onClose,
  onOpen,
}: {
  which: "followers" | "following" | null;
  /** Null while the list is still on its way. */
  people: FollowedPlayer[] | null;
  onClose: () => void;
  onOpen: (playerId: string) => void;
}) {
  if (!which) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing(4),
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "stretch",
            maxHeight: "80%",
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(3),
            }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}>
              {which === "followers" ? "Followers" : "Following"}{" "}
              <Text style={{ color: colors.textMuted, fontWeight: "400" }}>
                {people ? `· ${people.length}` : ""}
              </Text>
            </Text>
            <Tap onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Tap>
          </View>
          <ScrollView>
            {people === null ? (
              <Muted>Loading…</Muted>
            ) : (
            <PeopleList
              people={people}
              empty={
                which === "followers"
                  ? "Nobody yet. Share your profile."
                  : "Nobody yet. The next time somebody impresses you at a table, tap their name."
              }
              onOpen={onOpen}
            />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A list of players, each a tap to their profile: the website's PeopleList. */
export function PeopleList({
  people,
  empty,
  onOpen,
}: {
  people: FollowedPlayer[];
  empty: string;
  onOpen: (playerId: string) => void;
}) {
  if (people.length === 0) return <Muted>{empty}</Muted>;

  return (
    <View>
      {people.map((person, index) => (
        <Tap
          key={person.playerId}
          onPress={() => onOpen(person.playerId)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            paddingVertical: spacing(2.5),
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          <PlayerAvatar
            displayName={person.displayName}
            seed={person.playerId}
            avatarUrl={person.avatarUrl}
            frame={person.frame}
            size={32}
          />
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "600", flex: 1 }}
          >
            {person.displayName}
          </Text>
          {person.partners && (
            <Text style={{ color: colors.accent, fontSize: 12 }}>Trade partners</Text>
          )}
        </Tap>
      ))}
    </View>
  );
}

