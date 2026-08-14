"use client";

import { useState } from "react";
import { Loader2, UserCheck, UserPlus, Users } from "lucide-react";

import { cn } from "@/lib/cn";

/** The viewer's side of the relationship, as the API serves it. */
export interface FollowStateJson {
  following: boolean;
  followsYou: boolean;
  partners: boolean;
}

/**
 * Follow, following, or Trade partners - option C's one button.
 *
 * One-way follows anyone can make; when both players follow each other
 * the label becomes Trade partners, which is the product's word for
 * mutual. Tapping toggles the viewer's own edge only. No counts appear
 * here or anywhere: the numbers exist as rows and stay private.
 */
export function FollowButton({
  playerId,
  initial,
  className,
}: {
  playerId: string;
  /** Null hides the button: guests and your own profile. */
  initial: FollowStateJson | null;
  className?: string;
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

  const Icon = state.partners ? Users : state.following ? UserCheck : UserPlus;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(playerId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: state.following ? "unfollow" : "follow" }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { follow: FollowStateJson };
      setState(body.follow);
    } catch {
      /* The button keeps its truthful state; a retry is one tap away. */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-semibold transition-colors",
        state.following
          ? "border-border bg-elevated text-text-secondary hover:border-border-strong"
          : "border-accent/40 bg-accent/10 text-accent hover:border-accent",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
