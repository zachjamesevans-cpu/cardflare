import { useEffect, useRef, useState } from "react";

import { describeError } from "./api";

/**
 * Copies found, written optimistically, with one Undo.
 *
 * The hunts panel and the Feed's progress sheet set the same number
 * through different calls (by request, by Flare). What they share is
 * everything around the call: paint the new count at once, offer to
 * put it back for a few seconds, and if the server refuses, put it
 * back and say so. That lives here once.
 *
 * `reset` is whatever object the counts came from. When it changes the
 * server's word has arrived and every local number is dropped, so a
 * stale local count can never outlive the truth it was ahead of.
 */

/** How long Undo stays offered after a change, in milliseconds. */
export const UNDO_WINDOW = 6000;

export interface FoundEntry {
  /** What the count is keyed by: a request id, or a Flare id. */
  key: string;
  /** The card's name, for the Undo line. */
  label: string;
  needed: number;
  /** The count before this change, from the server or a prior write. */
  current: number;
  save: (value: number) => Promise<unknown>;
}

export function useCopiesFound({
  reset,
  onChanged,
}: {
  reset: unknown;
  onChanged?: () => void;
}) {
  const [local, setLocal] = useState<Record<string, number>>({});
  useEffect(() => setLocal({}), [reset]);

  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ entry: FoundEntry; previous: number } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const foundFor = (key: string, fallback: number): number => local[key] ?? fallback;

  const write = (entry: FoundEntry, value: number, offerUndo = true) => {
    const previous = foundFor(entry.key, entry.current);
    const next = Math.max(0, Math.min(entry.needed, value));
    if (next === previous) return;

    setLocal((current) => ({ ...current, [entry.key]: next }));
    setError(null);
    if (offerUndo) {
      setUndo({ entry, previous });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), UNDO_WINDOW);
    }

    entry
      .save(next)
      .then(() => onChanged?.())
      .catch((caught) => {
        setLocal((current) => ({ ...current, [entry.key]: previous }));
        setError(`That did not save (${describeError(caught)}). Try again.`);
      });
  };

  const undoLast = () => {
    if (!undo) return;
    const { entry, previous } = undo;
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
    write({ ...entry, current: foundFor(entry.key, entry.current) }, previous, false);
  };

  /** What the Undo line says, or null when there is nothing to undo. */
  const undoLabel = undo
    ? `${undo.entry.label}: ${foundFor(undo.entry.key, undo.entry.current)} found`
    : null;

  return { foundFor, write, undoLast, undoLabel, error };
}
