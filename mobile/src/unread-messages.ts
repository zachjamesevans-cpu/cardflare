import { useSyncExternalStore } from "react";

import { ApiError, listLocalThreads, onSignedOut, storedAccessToken } from "./api";

/**
 * How many messages are waiting, for the dot on the Messages tab.
 *
 * The same shape as src/unread.ts (the notices, for the Feed's bell),
 * with the same rules, for the conversations instead: the count is
 * every conversation's unread messages added up, read from the list
 * the Messages tab draws, so the dot and the bold rows cannot disagree.
 * App.tsx asks again at launch, on every return to the front, when a
 * push lands and on every tab change, which includes coming back from a
 * conversation that has just been read.
 *
 * - A failed read keeps the last value: a dot that blinks off because
 *   the network did is a dot nobody can trust.
 * - Signed out is 0.
 * - A set wins over a read that started before it.
 */
let count = 0;
let generation = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => count;

/** Set the count. */
export function setUnreadMessages(next: number): void {
  generation += 1;
  const value = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener();
}

/** Every conversation's unread messages, added up. */
export function totalUnread(threads: readonly { unread: number }[]): number {
  return threads.reduce(
    (sum, thread) =>
      sum + (Number.isFinite(thread.unread) ? Math.max(0, thread.unread) : 0),
    0,
  );
}

/** Ask the server again. Never throws; a failure keeps the last value. */
export async function refreshUnreadMessages(): Promise<void> {
  const started = generation;
  try {
    if (!(await storedAccessToken())) {
      if (generation === started) setUnreadMessages(0);
      return;
    }
    const { threads } = await listLocalThreads();
    if (generation !== started) return;
    if (Array.isArray(threads)) setUnreadMessages(totalUnread(threads));
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401 && generation === started) {
      setUnreadMessages(0);
    }
  }
}

/** The count, re-rendering whoever reads it when it changes. */
export function useUnreadMessages(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

onSignedOut(() => setUnreadMessages(0));
