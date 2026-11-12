import { useSyncExternalStore } from "react";

import {
  ApiError,
  getUnreadMessageCount,
  listLocalThreads,
  onSignedOut,
  storedAccessToken,
} from "./api";
import { askedRecently } from "./quiet-refresh";

/**
 * How many messages are waiting, for the dot on the Messages tab.
 *
 * The same shape as src/unread.ts (the notices, for the Feed's bell),
 * with the same rules, for the conversations instead: the count is
 * every conversation's unread messages added up. The Messages tab sets
 * it from the list it draws, so the dot and the bold rows cannot
 * disagree; everywhere else it is asked for as a number
 * (`/local/threads/unread`), because downloading every conversation on
 * every tab change to add up one figure was most of what a tab change
 * cost. App.tsx asks again at launch, on every return to the front,
 * when a push lands and on every tab change, which includes coming
 * back from a conversation that has just been read.
 *
 * - A failed read keeps the last value: a dot that blinks off because
 *   the network did is a dot nobody can trust.
 * - Signed out is 0.
 * - A set wins over a read that started before it.
 * - A server older than the count's route is asked for the list, the
 *   way this always worked, and is not asked for the count again.
 * - A tab change does not ask twice inside a few seconds.
 */
let count = 0;
let generation = 0;
/* When the server was last asked, for the tab bar's throttle. */
let askedAt = 0;
/* This server has no count route (404 or 400 for its path): the list
   is counted instead, for the rest of this run of the app. */
let countRouteMissing = false;
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

/**
 * The count, from the route that sends only the count. Null when this
 * server cannot say (it is older than the route, or the read failed for
 * any reason but a 401), so the caller counts the list instead. A 401
 * is thrown on, to be handled exactly as it always was.
 */
async function countFromServer(): Promise<number | null> {
  if (countRouteMissing) return null;
  try {
    const { unread } = await getUnreadMessageCount();
    return typeof unread === "number" && Number.isFinite(unread) ? unread : null;
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) throw caught;
    /* An older server reads "unread" as a conversation's id and says
       404 (or 400). That will not change until the next launch. */
    if (
      caught instanceof ApiError &&
      (caught.status === 404 || caught.status === 400)
    ) {
      countRouteMissing = true;
    }
    return null;
  }
}

/**
 * Ask the server again. Never throws; a failure keeps the last value.
 *
 * `throttle` is for the tab bar: a tab change inside a few seconds of
 * the last ask (flicking between tabs) does not ask again. Launch, a
 * return to the front and a push landing always ask.
 */
export async function refreshUnreadMessages(options?: {
  throttle?: boolean;
}): Promise<void> {
  if (options?.throttle && askedRecently(askedAt, Date.now())) return;
  askedAt = Date.now();
  const started = generation;
  try {
    if (!(await storedAccessToken())) {
      if (generation === started) setUnreadMessages(0);
      return;
    }
    const unread = await countFromServer();
    if (unread !== null) {
      if (generation === started) setUnreadMessages(unread);
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

onSignedOut(() => {
  setUnreadMessages(0);
  /* The next account's first tab change asks, whatever the clock says. */
  askedAt = 0;
});
