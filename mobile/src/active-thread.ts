/**
 * The conversation on screen right now, if any.
 *
 * Two things need to know it. The notification handler in App.tsx: a
 * message from the person you are already looking at should land in the
 * conversation, not as a banner over it, the way Messages and Instagram
 * behave. And the thread screen itself, which refreshes the moment a push
 * for it arrives instead of waiting for its next poll.
 *
 * Ids, plural, because a conversation can be opened by an old link's
 * anchor id while the server answers with the pair's one conversation id
 * (src/lib/local/pairs.ts), and a push names the conversation.
 *
 * Plain TypeScript, no React Native: the tests import it as it is.
 */
let active: readonly string[] = [];

/** Called on focus with every id the open screen answers to. */
export function setActiveThread(ids: readonly (string | null | undefined)[]): void {
  active = [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Called on blur. Only clears when the screen leaving is still the one recorded. */
export function clearActiveThread(ids: readonly (string | null | undefined)[]): void {
  if (ids.some((id) => id && active.includes(id))) active = [];
}

export function activeThreadIds(): readonly string[] {
  return active;
}

/**
 * The conversation a push opens, from its `url` (`/local?thread=<id>`,
 * src/lib/notifications/notify.ts), or null for any other push.
 */
export function threadIdFromPush(data: unknown): string | null {
  const url =
    data && typeof data === "object" ? (data as { url?: unknown }).url : undefined;
  if (typeof url !== "string") return null;
  const match = /[?&]thread=([^&#]+)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** True when a push is about the conversation already on screen. */
export function isActiveThreadPush(data: unknown): boolean {
  const id = threadIdFromPush(data);
  return id !== null && active.includes(id);
}
