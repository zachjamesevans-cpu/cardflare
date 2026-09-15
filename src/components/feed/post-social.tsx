"use client";

import { useState, useTransition } from "react";
import { Heart, Loader2, MessageCircle, PackageCheck } from "lucide-react";

import Link from "next/link";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { cn } from "@/lib/cn";
import {
  addPostCommentAction,
  loadPostThreadAction,
  togglePostLikeAction,
} from "@/lib/feed/post-actions";
import { POST_COMMENT_MAX, type PostComment } from "@/lib/feed/post-schema";

/**
 * The row under a Flare post: a heart with its count, a bubble with its
 * count, and the thread that opens under them.
 *
 * Instagram's shape, on purpose, and no more of it: no likes on
 * comments, no replies to replies. The thread is about one hunt, and
 * the OFFER lines in it are the point - "I have this" from a card
 * lands here with its note, so the author reads who is bringing what
 * in one place.
 *
 * The heart flips at once and the server settles it; the count follows
 * the flip so the number never lags the finger.
 */
export function PostSocial({
  postId,
  likes: initialLikes,
  liked: initialLiked,
  comments: initialComments,
}: {
  postId: string;
  likes: number;
  liked: boolean;
  comments: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [count, setCount] = useState(initialComments);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<PostComment[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [draft, setDraft] = useState("");
  const [sending, startSending] = useTransition();

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikes((current) => Math.max(0, current + (next ? 1 : -1)));
    startLoading(async () => {
      const done = await togglePostLikeAction(postId, next);
      if (!done) {
        setLiked(!next);
        setLikes((current) => Math.max(0, current + (next ? -1 : 1)));
      }
    });
  };

  const openThread = () => {
    const next = !open;
    setOpen(next);
    if (next && thread === null) {
      startLoading(async () => {
        setThread(await loadPostThreadAction(postId));
      });
    }
  };

  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    startSending(async () => {
      const comment = await addPostCommentAction(postId, body);
      if (!comment) return;
      setDraft("");
      setThread((current) => [...(current ?? []), comment]);
      setCount((current) => current + 1);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors",
            liked ? "text-accent" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Heart className={cn("size-5", liked && "fill-current")} aria-hidden="true" />
          <span className="tabular-nums">{likes}</span>
        </button>
        <button
          type="button"
          onClick={openThread}
          aria-expanded={open}
          aria-label={open ? "Hide comments" : "Show comments"}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors",
            open ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          <span className="tabular-nums">{count}</span>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {thread === null || (loading && thread === null) ? (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading…
            </p>
          ) : thread.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing here yet. Say something.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {thread.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5">
                  <Link href={`/p/${comment.playerId}`} className="shrink-0">
                    <PlayerAvatar
                      displayName={comment.displayName}
                      seed={comment.playerId}
                      avatarUrl={comment.avatarUrl}
                      frame={comment.frame}
                      ring={comment.ring}
                      size="sm"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm text-text-secondary">
                      <Link
                        href={`/p/${comment.playerId}`}
                        className="font-semibold text-text-primary hover:underline"
                      >
                        {comment.displayName}
                      </Link>{" "}
                      {comment.kind === "offer" && (
                        /* The OFFER line: a hand up on a named card. */
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 align-middle text-[11px] font-semibold text-accent uppercase">
                          <PackageCheck className="size-3" aria-hidden="true" />
                          {comment.cardName ? `Has ${comment.cardName}` : "Has it"}
                        </span>
                      )}
                    </p>
                    <p className="text-sm break-words text-text-primary">
                      {comment.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={POST_COMMENT_MAX}
              placeholder="Add a comment"
              aria-label="Add a comment"
              className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-border-strong focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-60"
            >
              {sending ? "Posting…" : "Post"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
