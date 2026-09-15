import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import {
  commentOnPost,
  describeError,
  getPost,
  likePost,
  offerFromPost,
  POST_COMMENT_MAX,
  rememberRoom,
  type PostDetail,
} from "../api";
import { FeedPerson } from "../feed-person";
import { openRoom } from "../open-room";
import { PlayerAvatar } from "../player-avatar";
import { PostSocialRow, haveFor, type PostRef } from "../post-social";
import { colors, radius, spacing } from "../theme";
import {
  AsyncButton,
  Button,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  type ZoomCard,
} from "../ui";

/**
 * One Flare post, opened from its bubble in the Feed.
 *
 * The website draws the thread inline under the post; the app's Feed
 * cards are native, so the thread is a screen of its own with the same
 * three things in the same order: the cards (tap one for "I have
 * this"), the heart and the count, then the comments and a composer.
 * The OFFER lines in the thread are the point - who is bringing what,
 * in one place.
 */
export function FlarePostScreen({ postId }: { postId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { post: fresh } = await getPost(postId);
      setPost(fresh);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || !post) return;
    setError(null);
    try {
      const { comment } = await commentOnPost(post.postId, body);
      setDraft("");
      setPost({
        ...post,
        thread: [...post.thread, comment],
        comments: post.comments + 1,
      });
    } catch (caught) {
      setError(`That did not post (${describeError(caught)}). Try again in a moment.`);
    }
  };

  if (failed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: spacing(4) }}>
        <Muted>This Flare could not be opened. It may have been taken down.</Muted>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: spacing(4) }}>
        <Muted>Loading…</Muted>
      </View>
    );
  }

  const ref: PostRef = {
    postId: post.postId,
    yours: post.yours,
    offer: async (flareId, note) => {
      await offerFromPost(post.postId, flareId, note);
      await load();
    },
  };

  const shelf: ZoomCard[] = post.cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, ref),
  }));

  const total = post.cards.length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
        keyboardShouldPersistTaps="handled"
      >
        <FeedPerson
          playerId={post.author.playerId}
          displayName={post.author.displayName}
          avatarUrl={post.author.avatarUrl}
          frame={post.author.frame}
          ring={post.author.ring}
          detail={`${total === 1 ? "is hunting" : `is hunting ${total} cards`}${
            post.deckLabel ? ` · ${post.deckLabel}` : ""
          }${post.eventName ? ` · ${post.eventName}` : ""}`}
          onOpen={(id) => navigation.navigate("PlayerProfile", { playerId: id })}
        />

        {/* The cards, tap one to open it big and say you have it. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: spacing(2),
            alignItems: "center",
            paddingVertical: spacing(0.5),
          }}
        >
          {post.cards.map((card, index) => (
            <CardImage
              key={card.cardId}
              imageUrl={card.imageUrl}
              width={total <= 1 ? 160 : 96}
              name={card.cardName}
              cardNumber={card.cardNumber}
              youHave={card.match ? { kind: card.match, count: 0 } : undefined}
              state={card.state}
              have={haveFor(card, ref)}
              siblings={shelf}
              position={index}
            />
          ))}
        </ScrollView>
        {!post.yours ? (
          <Muted>Tap a card to say you have it.</Muted>
        ) : null}

        <PostSocialRow
          likes={post.likes}
          liked={post.liked}
          comments={post.comments}
          onLike={(liked) => likePost(post.postId, liked)}
          onOpenThread={() => undefined}
          threadOpen
        />

        {/* The thread, oldest first, the way a conversation reads. */}
        <View
          style={{
            gap: spacing(3),
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing(3),
          }}
        >
          {post.thread.length === 0 ? (
            <Muted>Nothing here yet. Say something.</Muted>
          ) : (
            post.thread.map((comment) => (
              <View
                key={comment.id}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(2.5) }}
              >
                <Tap
                  onPress={() =>
                    navigation.navigate("PlayerProfile", { playerId: comment.playerId })
                  }
                >
                  <PlayerAvatar
                    displayName={comment.displayName}
                    seed={comment.playerId}
                    avatarUrl={comment.avatarUrl}
                    frame={comment.frame}
                    ring={comment.ring}
                    size={32}
                  />
                </Tap>
                <View style={{ flex: 1, gap: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: spacing(1.5),
                    }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}>
                      {comment.displayName}
                    </Text>
                    {comment.kind === "offer" ? (
                      /* The OFFER line: a hand up on a named card. */
                      <View
                        style={{
                          borderRadius: radius.control,
                          borderWidth: 1,
                          borderColor: colors.accentMuted,
                          backgroundColor: colors.elevated,
                          paddingHorizontal: spacing(2),
                          paddingVertical: 1,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.accent,
                            fontSize: 10,
                            fontWeight: "700",
                            letterSpacing: 0.5,
                          }}
                        >
                          {(comment.cardName ? `HAS ${comment.cardName}` : "HAS IT").toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{comment.body}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {post.code && post.storeName ? (
          <Button
            label={`Go to ${post.storeName}`}
            onPress={() => {
              void rememberRoom((post.code ?? "").trim().toUpperCase()).then(() =>
                openRoom(navigation),
              );
            }}
          />
        ) : null}
      </ScrollView>

      <View
        style={{
          padding: spacing(3),
          paddingBottom: spacing(3) + insets.bottom,
          gap: spacing(2),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Input
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={POST_COMMENT_MAX}
              placeholder="Add a comment"
            />
          </View>
          <AsyncButton label="Post" pendingLabel="Posting…" onPress={send} />
        </View>
        <ErrorLine message={error} />
      </View>
    </KeyboardAvoidingView>
  );
}
