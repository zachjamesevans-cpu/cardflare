"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { hidePost, unhidePost } from "@/components/feed/hidden-posts";
import { Button } from "@/components/ui/button";
import {
  restoreFlaresAction,
  type TakeDownResult,
} from "@/lib/flares/withdraw-actions";

/**
 * "Taken down. Undo", for a minute.
 *
 * The audit of 2026-10-01: "Remove" on a Flare marked it found and
 * announced it, and a wrong post had no way out. Take down is the
 * second exit, and this is its safety net: the row leaves the screen
 * the moment the server says ok, and the toast holds the ids for the
 * same sixty seconds the server will honour a restore.
 *
 * LEAVES THE LIST AT ONCE. The audit of 2026-10-02: the toast came up
 * in under a second and the post stayed for three to five more, until
 * the refresh behind it had rebuilt the page. So a post's take-down
 * hands its id to the hidden-posts store on the same tick as the
 * toast, the Feed card hides itself on that paint, Undo unhides it,
 * and the refresh only confirms.
 *
 * The toast outlives the post that fired it. A take-down ends in
 * `router.refresh()`, which removes the post, and with it any state
 * the post's own menu was holding. So the state lives here, in a
 * module store, and ONE host draws it: `UndoToastHost`, mounted beside
 * the tab bar, which every page that draws a post or a board already
 * has. The room reuses it: its "Take down" calls the same hook.
 */

/** The server's window, mirrored: `UNDO_WINDOW_MS` in lib/flares/withdraw.ts. */
export const UNDO_TOAST_MS = 60 * 1000;

interface UndoState {
  message: string;
  /** The rows to put back. Empty means nothing to undo, only a notice. */
  flareIds: string[];
  /** The room the take-down happened in, for a guest's restore. */
  code?: string;
  /** The Feed post hidden on the spot, which Undo brings back. */
  postId?: string;
  /** Distinguishes two toasts with the same words, so the timer restarts. */
  at: number;
}

let current: UndoState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UndoState | null {
  return current;
}

function getServerSnapshot(): UndoState | null {
  return null;
}

function setToast(next: UndoState | null): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Shows the toast. Exported for the two doors; everything else goes through `useTakeDown`. */
export function showUndoToast(state: Omit<UndoState, "at">): void {
  setToast({ ...state, at: Date.now() });
}

export function dismissUndoToast(): void {
  setToast(null);
}

/**
 * The take-down flow, for a post's menu and a board's tile alike.
 *
 * Runs the action; on success the post is hidden (when the caller
 * names one), the toast goes up, and the page re-reads itself behind
 * them so the server's word replaces the page's. A refusal is said in
 * the same toast, without an Undo, rather than in an error line under
 * a row that may no longer exist.
 */
export function useTakeDown(code?: string): {
  takeDown: (run: () => Promise<TakeDownResult>, postId?: string) => void;
  pending: boolean;
} {
  const router = useRouter();
  const [pending, start] = useTransition();

  const takeDown = (run: () => Promise<TakeDownResult>, postId?: string) => {
    if (pending) return;
    start(async () => {
      const result = await run();
      if (!result.ok) {
        showUndoToast({ message: result.message, flareIds: [] });
        return;
      }
      /* The moment the server says ok: hidden and said, on one paint. */
      if (postId) hidePost(postId);
      showUndoToast({
        message: "Taken down.",
        flareIds: result.flareIds,
        code,
        postId,
      });
      router.refresh();
    });
  };

  return { takeDown, pending };
}

/** The one place the toast is drawn. Mounted with the player tab bar. */
export function UndoToastHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!state) return null;
  return <UndoToast key={state.at} state={state} />;
}

function UndoToast({ state }: { state: UndoState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  /* The timer is set once per toast and never reset by a re-render. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(dismissUndoToast, UNDO_TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const undo = () => {
    if (pending) return;
    start(async () => {
      const result = await restoreFlaresAction(state.flareIds, state.code);
      if (!result.ok || result.restored === 0) {
        setFailed(true);
        return;
      }
      /* Back in the list at once; the refresh behind it only confirms. */
      if (state.postId) unhidePost(state.postId);
      dismissUndoToast();
      router.refresh();
    });
  };

  return (
    /*
     * Above the floating tab bar, inside the same width, so it reads as
     * part of the chrome rather than a page element that happens to be
     * stuck. `bottom-24` clears the pill and the gap beneath it, the
     * same sum TabBarSpacer reserves.
     */
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex w-fit max-w-2xl items-center gap-3 rounded-full border border-border bg-surface/95 py-1.5 pr-1.5 pl-4 text-sm text-text-primary shadow-[var(--shadow-panel)] backdrop-blur-xl"
    >
      <span className="font-medium">
        {failed ? "Could not put that back." : state.message}
      </span>
      {state.flareIds.length > 0 && !failed && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={pending}
          className="rounded-full font-bold text-accent hover:text-accent"
        >
          <Undo2 className="size-4" aria-hidden="true" />
          Undo
        </Button>
      )}
      {(state.flareIds.length === 0 || failed) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismissUndoToast}
          className="rounded-full"
        >
          OK
        </Button>
      )}
    </div>
  );
}
