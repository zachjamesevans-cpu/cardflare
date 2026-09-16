"use client";

import { useOptimistic, useState, useTransition } from "react";
import { LayoutList } from "lucide-react";

import { setFeedViewAction } from "@/lib/feed/view-actions";
import {
  FEED_VIEWS,
  FEED_VIEW_BLURBS,
  FEED_VIEW_TITLES,
  type FeedView,
} from "@/lib/feed/views";

/**
 * Choosing how the Feed is drawn, in profile settings.
 *
 * The founder: "lets develop a few 'views' for the feed, that can be
 * changed under settings in the profile." The app's half of this is
 * mobile/src/screens/settings.tsx - same words, same order, because the
 * titles and blurbs come from one shared file.
 *
 * Optimistic, because a view is a thing you flick between to see which
 * you prefer. A failed write puts the choice back and says so rather
 * than leaving a radio that lies about what the Feed will do.
 */
export function FeedViewPicker({ current }: { current: FeedView }) {
  const [pending, start] = useTransition();
  const [view, setView] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <LayoutList className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Feed view</p>
          <p className="text-sm text-text-secondary">
            Pick how a Flare is drawn in your Feed. Saved to your account, so it follows
            you to the app.
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Feed view</legend>
        {FEED_VIEWS.map((option) => {
          const on = view === option;
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors ${
                on
                  ? "border-accent bg-accent/[0.08]"
                  : "border-border bg-elevated hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="feed-view"
                value={option}
                checked={on}
                disabled={pending}
                onChange={() =>
                  start(async () => {
                    setView(option);
                    setError(null);
                    const result = await setFeedViewAction(option);
                    if (!result.ok) setError(result.error ?? "Could not save that.");
                  })
                }
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={`font-semibold ${on ? "text-accent" : "text-text-primary"}`}
                >
                  {FEED_VIEW_TITLES[option]}
                </span>
                <span className="text-sm text-text-muted">
                  {FEED_VIEW_BLURBS[option]}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
