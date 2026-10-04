import { useSyncExternalStore } from "react";

/**
 * Posts taken down on this page, hidden before the server confirms.
 *
 * The audit of 2026-10-02: "Take down shows 'Taken down.' before the
 * post leaves the list. The toast appeared in 0.6s, but the post
 * stayed in the list for another 3 to 5s." The toast fires the moment
 * the server says ok; the post left when the refresh behind it had
 * rebuilt the page. So the ids of taken-down posts live here, in a
 * module store the Feed card reads, and the card hides itself on the
 * same paint as the toast. Undo takes the id back out, and the refresh
 * that follows only confirms what the page already shows.
 *
 * The page's life, nothing more: a reload reads the server, which is
 * right by then. The app does the same in its Feed screen's state.
 *
 * A block works the same way, by author: the moment the server says
 * the player is blocked, every post of theirs on the page leaves the
 * list, and the refresh behind the status line only confirms.
 */

let hidden: ReadonlySet<string> = new Set();
let hiddenAuthors: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const EMPTY: ReadonlySet<string> = new Set();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
  return hidden;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

function getAuthorSnapshot(): ReadonlySet<string> {
  return hiddenAuthors;
}

function set(next: ReadonlySet<string>): void {
  hidden = next;
  for (const listener of listeners) listener();
}

function setAuthors(next: ReadonlySet<string>): void {
  hiddenAuthors = next;
  for (const listener of listeners) listener();
}

/** The post leaves the list now; the server has already said ok. */
export function hidePost(postId: string): void {
  if (hidden.has(postId)) return;
  set(new Set([...hidden, postId]));
}

/** Undo: the post comes back where it was. */
export function unhidePost(postId: string): void {
  if (!hidden.has(postId)) return;
  const next = new Set(hidden);
  next.delete(postId);
  set(next);
}

export function isPostHidden(postId: string): boolean {
  return hidden.has(postId);
}

/** Every post by this player leaves the list now; they are blocked. */
export function hideAuthor(playerId: string): void {
  if (hiddenAuthors.has(playerId)) return;
  setAuthors(new Set([...hiddenAuthors, playerId]));
}

export function isAuthorHidden(playerId: string): boolean {
  return hiddenAuthors.has(playerId);
}

/** Whether this post is hidden, live. */
export function usePostHidden(postId: string): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).has(postId);
}

/** Whether this post's author is hidden, live. A store post has no author. */
export function useAuthorHidden(playerId: string | null | undefined): boolean {
  const authors = useSyncExternalStore(subscribe, getAuthorSnapshot, getServerSnapshot);
  return playerId ? authors.has(playerId) : false;
}

/** For tests: back to nothing hidden. */
export function resetHiddenPosts(): void {
  set(new Set());
  setAuthors(new Set());
}
