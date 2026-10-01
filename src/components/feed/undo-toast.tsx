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
 * the moment the tap lands, and the toast holds the ids for the same
 * sixty seconds the server will honour a restore.
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
 * Runs the action; on success the toast goes up and the page re-reads
 * itself so the post is gone before anybody can tap it twice. A refusal
 * is said in the same toast, without an Undo, rather than in an error
 * line under a row that may no longer exist.
 */
export function useTakeDown(code?: string): {
  takeDown: (run: () => Promise<TakeDownResult>) => void;
  pending: boolean;
} {
  const router = useRouter();
  const [pending, start] = useTransition();

  const takeDown = (run: () => Promise<TakeDownResult>) => {
    if (pending) return;
    start(async () => {
      const result = await run();
      if (!result.ok) {
        showUndoToast({ message: result.message, flareIds: [] });
        return;
      }
      showUndoToast({ message: "Taken down.", flareIds: result.flareIds, code });
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
