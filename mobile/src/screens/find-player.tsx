import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { searchPlayersByName, type FoundPlayer } from "../api";
import { formatHandle } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import { Body, Input, Muted, Tap } from "../ui";
import { colors, spacing } from "../theme";

/**
 * Finding somebody, from the screen you already have open.
 *
 * The founder: "the social features should be a litle more front and
 * center. for example, having the abilty to search for someone outside
 * of having to go all thew ay to the bottom of my profile would be
 * nice... let's make a search icon in the top right of the main feed."
 *
 * The same search that already lives at the bottom of the profile, given
 * a door of its own. One way to find a player rather than two that can
 * disagree - the profile's copy stays where it is, because somebody
 * managing who they follow is already standing there.
 */
export function FindPlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlayer[] | null>(null);

  /* Debounced, and guarded against answers landing out of order: shop
     wifi is slow enough that the third keystroke can beat the first. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const searchFor = (text: string) => {
    if (timer.current) clearTimeout(timer.current);

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setFound(null);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      searchPlayersByName(trimmed)
        .then((result) => {
          if (latest.current === request) setFound(result.players);
        })
        .catch(() => {});
    }, 300);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
      keyboardShouldPersistTaps="handled"
    >
      {/* No heading: the navigation bar above already says "Find a
          player", and saying it twice is how a screen looks unfinished. */}
      <Body>
        Search by name or @handle. Their profile is where the follow button
        lives, and following each other makes you Trade partners.
      </Body>

      <Input
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          searchFor(text);
        }}
        placeholder="Find a player by name or @handle"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {found !== null &&
        (found.length === 0 ? (
          <Muted>Nobody by that name yet.</Muted>
        ) : (
          <View>
            {found.map((person, index) => (
              <Tap
                key={person.playerId}
                onPress={() =>
                  navigation.navigate("PlayerProfile", { playerId: person.playerId })
                }
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
                {/* Both, because a result list is exactly where two people
                    called Zach turn up together and the handle is the only
                    thing that tells them apart. */}
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontWeight: "600" }}
                  >
                    {person.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textMuted, fontSize: 12 }}
                  >
                    {formatHandle(person.handle)}
                  </Text>
                </View>
              </Tap>
            ))}
          </View>
        ))}
    </ScrollView>
  );
}
