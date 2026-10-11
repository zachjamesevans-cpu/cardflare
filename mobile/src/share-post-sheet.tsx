import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import {
  getFollowing,
  openDirectThread,
  searchPlayersByName,
  sendLocalMessage,
} from "./api";
import { PlayerAvatar } from "./player-avatar";
import { postLink } from "./post-link";
import { SwipeToClose } from "./sheet-swipe";
import { colors, radius, spacing } from "./theme";
import { Button, ErrorLine, Input, Muted, Tap } from "./ui";

/**
 * Sending a post to people, from the Feed's paper plane.
 *
 * Instagram's share sheet, which the founder asked for by name: "a popup
 * of the people you follow... the exact share option for sharing posts
 * on instagram in little circles of their profile pics". So: a search
 * field, then everyone you follow as round faces in a grid of three,
 * newest follow first. A tap ticks a face; once one is ticked the foot
 * becomes "Write a message..." and Send ("Send separately" for several,
 * since each person gets their own conversation, not a group).
 *
 * Each send opens (or finds) the one-to-one conversation and posts the
 * note with the post's line under it (see post-link.ts); the chat draws
 * that line as the post itself, a tap into it. With no note the post is
 * the whole message, as on Instagram. Search reaches past the people you
 * follow to anyone by name, as Instagram's does.
 */

export interface SharedPost {
  postId: string;
  posterName: string;
  /** "Portgas.D.Ace" or the hunt's name: what the post is about. */
  subject: string;
}

interface Person {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring?: string | null;
  aura?: string | null;
}

const FACE = 68;

export function SharePostSheet({
  post,
  onClose,
}: {
  post: SharedPost;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [following, setFollowing] = useState<Person[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<Person[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFollowing()
      .then((answer) => alive && setFollowing(answer.following))
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  /* Anyone by name once two letters are in, a beat after the last key. */
  const term = query.trim();
  useEffect(() => {
    if (term.length < 2) {
      setFound(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      searchPlayersByName(term)
        .then((answer) => alive && setFound(answer.players))
        .catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term]);

  /* The people you follow who match first, then anyone else found. */
  const people = useMemo(() => {
    if (!following) return null;
    if (!term) return following;
    const lower = term.toLowerCase();
    const mine = following.filter((person) =>
      person.displayName.toLowerCase().includes(lower),
    );
    const known = new Set(mine.map((person) => person.playerId));
    const others = (found ?? []).filter((person) => !known.has(person.playerId));
    return [...mine, ...others];
  }, [following, found, term]);

  const isPicked = (person: Person) =>
    picked.some((each) => each.playerId === person.playerId);
  const toggle = (person: Person) => {
    setError(null);
    setPicked((now) =>
      isPicked(person)
        ? now.filter((each) => each.playerId !== person.playerId)
        : [...now, person],
    );
  };

  const send = async () => {
    if (picked.length === 0 || sending) return;
    setSending(true);
    setError(null);
    const link = postLink(post.postId);
    const body = note.trim() ? `${note.trim()}\n${link}` : link;
    const missed: string[] = [];
    for (const person of picked) {
      try {
        const opened = await openDirectThread(person.playerId);
        if (!opened.ok || !opened.threadId) throw new Error("closed");
        const answer = await sendLocalMessage(opened.threadId, body);
        if (!answer.ok) throw new Error("unsent");
      } catch {
        missed.push(person.displayName);
      }
    }
    setSending(false);
    if (missed.length > 0) {
      setPicked((now) => now.filter((each) => missed.includes(each.displayName)));
      setError(`Couldn't send to ${missed.join(", ")}. Try again.`);
      return;
    }
    setSent(true);
    setTimeout(onClose, 700);
  };

  return (
    /* Fade, not slide, as every sheet here: a sliding Modal carries its
       backdrop up with it. */
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
          <SwipeToClose
            onClose={onClose}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              paddingTop: spacing(2),
              paddingHorizontal: spacing(4),
              paddingBottom: spacing(4) + insets.bottom,
              gap: spacing(3),
              height: "72%",
            }}
          >
            {/* The grab handle: this pulls down to close. */}
            <View
              style={{
                alignSelf: "center",
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.borderStrong,
              }}
            />

            <View style={{ justifyContent: "center" }}>
              <Ionicons
                name="search"
                size={16}
                color={colors.textMuted}
                style={{ position: "absolute", left: spacing(3), zIndex: 1 }}
              />
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                accessibilityLabel="Search people"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={{ paddingLeft: spacing(9), borderRadius: 999 }}
              />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap" }}
            >
              {loadFailed ? (
                <ErrorLine message="Couldn't load the people you follow." />
              ) : people === null ? (
                <View style={{ width: "100%", paddingTop: spacing(6) }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : people.length === 0 ? (
                <View style={{ width: "100%", paddingTop: spacing(4) }}>
                  <Muted>
                    {term
                      ? found === null && term.length >= 2
                        ? "Searching..."
                        : "No one by that name."
                      : "Follow people to send them posts."}
                  </Muted>
                </View>
              ) : (
                people.map((person) => (
                  <Face
                    key={person.playerId}
                    person={person}
                    picked={isPicked(person)}
                    onPress={() => toggle(person)}
                  />
                ))
              )}
            </ScrollView>

            {/* Nothing ticked, nothing at the foot; one ticked, the note
                and the button, as Instagram's sheet does. */}
            {picked.length > 0 ? (
              <View style={{ gap: spacing(2) }}>
                <ErrorLine message={error} />
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="Write a message..."
                  accessibilityLabel="Write a message"
                  maxLength={500}
                />
                <Button
                  label={sent ? "Sent" : picked.length > 1 ? "Send separately" : "Send"}
                  onPress={() => void send()}
                  busy={sending}
                  disabled={sent}
                />
              </View>
            ) : null}
          </SwipeToClose>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One face in the grid: the round picture, the name, a tick when chosen. */
function Face({
  person,
  picked,
  onPress,
}: {
  person: Person;
  picked: boolean;
  onPress: () => void;
}) {
  return (
    <View
      style={{ width: "33.333%", alignItems: "center", paddingVertical: spacing(2) }}
    >
      <Tap
        onPress={onPress}
        accessibilityLabel={`${picked ? "Unselect" : "Select"} ${person.displayName}`}
        accessibilityState={{ selected: picked }}
        style={{ alignItems: "center", gap: spacing(1.5), maxWidth: FACE + spacing(6) }}
      >
        <View>
          <PlayerAvatar
            displayName={person.displayName}
            seed={person.playerId}
            avatarUrl={person.avatarUrl}
            frame={person.frame}
            ring={person.ring ?? null}
            aura={person.aura ?? null}
            size={FACE}
          />
          {picked ? (
            <View
              style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.accent,
                borderWidth: 2,
                borderColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark" size={15} color={colors.accentContrast} />
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textPrimary,
            fontSize: 12,
            textAlign: "center",
            fontWeight: picked ? "700" : "400",
          }}
        >
          {person.displayName}
        </Text>
      </Tap>
    </View>
  );
}
