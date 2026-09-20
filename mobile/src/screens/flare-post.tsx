import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
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
import { FlareCardsSheet, type FlareSheetPost } from "../flare-cards-sheet";
import { cardsLabel } from "../flare-copy";
import { FlareCardSlide, FlareCarousel, shelfFor } from "../flare-deck-pager";
import { FlareActions, FlareTypeChip, statusLabel } from "../flare-feed-card";
import { FlareProgressSheet } from "../flare-progress-sheet";
import { openRoom } from "../open-room";
import { PlayerAvatar } from "../player-avatar";
import { PostSocialRow, type PostRef } from "../post-social";
import { StorePostBody, StorePostHeader } from "../store-post-card";
import { colors, gutter, radius, spacing } from "../theme";
import { AsyncButton, Button, ErrorLine, Input, Muted, Tap } from "../ui";

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
  /* The cards in a sheet, to read or to offer on; and your own
     progress. The same two sheets the Feed opens. */
  const [cardsSheet, setCardsSheet] = useState<
    (FlareSheetPost & { mode: "view" | "offer" }) | null
  >(null);
  const [progressSheet, setProgressSheet] = useState<FlareSheetPost | null>(null);

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
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Muted>This Flare could not be opened. It may have been taken down.</Muted>
      </View>
    );
  }

  if (!post) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
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

  const shelf = shelfFor(post.cards, ref);
  const total = post.cards.length;
  const direction = post.direction ?? "want";
  const lead = post.cards[0];
  const sheetPost: FlareSheetPost = {
    postId: post.postId,
    posterName: post.author.displayName,
    direction,
    yours: post.yours,
    completed: post.completed ?? false,
    cards: post.cards,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(3),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {post.store ? (
          /* A STORE's post: the shop's header and what it said, then the
             same heart and thread every post has. No cards, no offers -
             the store wrote it, and there is nothing to have. */
          <>
            <StorePostHeader
              name={post.store.name}
              logoUrl={post.store.logoUrl}
              verified={post.store.verified}
              postedAt={post.store.postedAt}
              onOpenStore={() =>
                navigation.navigate("StoreProfile", {
                  storeId: post.store?.storeId ?? "",
                })
              }
            />
            <StorePostBody
              title={post.store.title}
              body={post.store.body}
              imageUrl={post.store.imageUrl}
            />
          </>
        ) : (
          <>
            <FeedPerson
              playerId={post.author.playerId}
              displayName={post.author.displayName}
              avatarUrl={post.author.avatarUrl}
              frame={post.author.frame}
              ring={post.author.ring}
              aura={post.author.aura ?? null}
              detail={`${statusLabel(post)}${total > 1 ? ` · ${cardsLabel(total)}` : ""}${
                post.eventName ? ` · ${post.eventName}` : ""
              }`}
              onOpen={(id) => navigation.navigate("PlayerProfile", { playerId: id })}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
              <FlareTypeChip
                label={direction === "showcase" ? "Offering" : "Want"}
                primary
              />
            </View>

            {/* The cards, the way the Feed draws them: one row, or the
                same row swiped. Tap one to open it big and say you have it. */}
            {total === 1 && lead ? (
              <FlareCardSlide
                card={lead}
                direction={direction}
                post={ref}
                siblings={shelf}
                position={0}
              />
            ) : (
              <FlareCarousel
                cards={post.cards}
                total={total}
                direction={direction}
                post={ref}
                remainingCopies={post.remainingCopies}
                onViewAll={() => setCardsSheet({ ...sheetPost, mode: "view" })}
              />
            )}

            {post.caption ? (
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
              >
                {post.caption}
              </Text>
            ) : null}
          </>
        )}

        {post.hunt ? (
          <Tap
            onPress={() => navigation.navigate("Hunt", { huntId: post.hunt?.id ?? "" })}
            accessibilityLabel={`View hunt ${post.hunt.name}`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 1 }}
            >
              {post.hunt.name}
            </Text>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              · View hunt
            </Text>
          </Tap>
        ) : null}

        {post.store ? null : (
          <>
            <FlareActions
              yours={post.yours}
              direction={direction}
              completed={post.completed ?? false}
              onOffer={() => setCardsSheet({ ...sheetPost, mode: "offer" })}
              onProgress={() => setProgressSheet(sheetPost)}
            />
            {!post.yours && direction === "want" && !post.completed ? (
              <Muted>Tap a card to say you have it, or offer several at once.</Muted>
            ) : null}
          </>
        )}

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
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: spacing(2.5),
                }}
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
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontWeight: "700",
                        fontSize: 14,
                      }}
                    >
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
                          {(comment.cardName
                            ? `HAS ${comment.cardName}`
                            : "HAS IT"
                          ).toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                    {comment.body}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {!post.store && post.code && post.storeName ? (
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

      <FlareCardsSheet
        open={cardsSheet}
        onClose={() => setCardsSheet(null)}
        onChanged={() => void load()}
      />
      <FlareProgressSheet
        open={progressSheet}
        onClose={() => setProgressSheet(null)}
        onChanged={() => void load()}
      />
    </KeyboardAvoidingView>
  );
}
