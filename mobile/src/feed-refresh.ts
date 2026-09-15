/**
 * "The Feed is out of date" — said once, heard by the Feed.
 *
 * The founder: "make sure that when I post a flare, it immediately
 * begins a refresh on the main feed so i can click feed instantly and
 * itll already be there."
 *
 * The Feed already reloads when you arrive on it, which is why a post
 * did eventually show up. But a tab screen stays MOUNTED behind the one
 * you are looking at, so that reload only starts when you tap Feed, and
 * you watch it happen. Starting it at the moment of posting means the
 * answer is usually already in hand by the time the tab is tapped.
 *
 * A set of callbacks rather than an event library: one publisher, one
 * subscriber, and nothing to keep in sync. The Feed subscribes while it
 * is mounted and drops out when it is not, so firing this with no Feed
 * on the stack is a no-op rather than a leak.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** The Feed, saying it would like to know. Returns its own unsubscribe. */
export function onFeedStale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Something happened that the Feed should show — a Flare posted, most
 * of all. Safe to call from anywhere, including when no Feed exists.
 */
export function markFeedStale(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* One bad subscriber must not stop the others, and none of this is
         worth failing a post over. */
    }
  }
}
