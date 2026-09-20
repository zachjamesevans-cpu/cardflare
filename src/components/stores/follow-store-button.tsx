"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { followStoreAction, unfollowStoreAction } from "@/lib/players/local-actions";

/**
 * Follow, or Following: one button, the same words on both platforms.
 *
 * Flips the moment it is tapped and settles on what the server says,
 * so a tap at a counter on bad wifi reads as done rather than stuck.
 * If the write fails the label goes back to the truth. Rendered only
 * for a signed-in player; everyone else gets a "Sign in to follow" link
 * from the page instead, because a button that cannot work is a lie.
 */
export function FollowStoreButton({
  storeId,
  initial,
  code,
  size = "md",
  className,
}: {
  storeId: string;
  /** Whether the player already follows this store. */
  initial: boolean;
  /** The room this sits in, when it does, so the room repaints too. */
  code?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      try {
        const result = next
          ? await followStoreAction(storeId, code)
          : await unfollowStoreAction(storeId, code);
        setFollowing(result.following);
      } catch {
        setFollowing(!next);
      }
    });
  };

  const Icon = pending ? Loader2 : following ? Check : Plus;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={following}
      className={cn(
        buttonStyles(following ? "ghost" : "secondary", size),
        following && "border border-border",
        "cursor-pointer",
        className,
      )}
    >
      <Icon className={cn("size-4", pending && "animate-spin")} aria-hidden="true" />
      {following ? "Following" : "Follow"}
    </button>
  );
}
