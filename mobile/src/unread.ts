import { useSyncExternalStore } from "react";

import { ApiError, getUnreadCount, onSignedOut, storedAccessToken } from "./api";
import { syncBadge } from "./push";

/**
 * How many notices are unread, shared by the tab bar and the Inbox.
 *
 * The founder (2026-10-05): "If you have an unread notification in
 * app, there should be a small neon green dot on the inbox icon so you
 * know to check your inbox." App.tsx draws the dot from this number
 * and refreshes it (launch, foreground, every tab change, a notice
 * arriving while open); the Inbox sets it to 0 once it has marked its
 * notices read. One value, so the two can never disagree.
 *
 * THE RULES:
 *
 * - A failed read keeps the last value. A dot that blinks off because
 *   the network did is a dot nobody can trust.
 * - Signed out is 0: no account, no inbox, no dot.
 * - A set wins over a read that started before it. The Inbox clearing
 *   the dot must not be undone by a refresh that left before the
 *   notices were marked read and came back after.
 */
let count = 0;
/* Bumped by every set, so a read can tell it has been overtaken. */
let generation = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => count;

/** The count now, outside React. */
export function unreadCount(): number {
  return count;
}

/** Set the count, e.g. 0 once the Inbox has marked its notices read. */
export function setUnread(next: number): void {
  generation += 1;
  const value = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener();
}

/** Ask the server again. Never throws; a failure keeps the last value. */
export async function refreshUnread(): Promise<void> {
  const started = generation;
  try {
    if (!(await storedAccessToken())) {
      if (generation === started) setUnread(0);
      return;
    }
    const { unread } = await getUnreadCount();
    if (generation !== started) return;
    if (typeof unread === "number") {
      setUnread(unread);
      /* The icon's badge is the same server count (every push carries
         it), so it is set from here too: on launch, on every return to
         the front, and after a conversation is read, which clears its
         message notice. Otherwise the icon kept the number the last
         push wore until somebody opened the Inbox. */
      void syncBadge(unread);
    }
  } catch (caught) {
    /* A 401 is "signed out", which has no dot. Anything else is the
       network, and the last value stands. */
    if (caught instanceof ApiError && caught.status === 401 && generation === started) {
      setUnread(0);
    }
  }
}

/** The count, re-rendering whoever reads it when it changes. */
export function useUnread(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* Signing out takes the dot with it. */
onSignedOut(() => setUnread(0));
