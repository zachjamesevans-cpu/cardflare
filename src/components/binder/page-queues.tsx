"use client";

import { useCallback, useEffect, useState } from "react";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { queuesForAction } from "@/lib/cards/page-job-actions";
import { CHECK_NOW, pagesWaitingLine } from "@/lib/cards/scan-rules";

/**
 * The binder's side of pages read in the background: the queues still
 * out on it, and the banner over the pockets that says so.
 *
 * The founder: "maybe it scans it, and then they'll get a notification
 * once it's ready." The notice is one way back to the check; this is
 * the other, for somebody already on the binder. One banner per queue,
 * "Reading 5 pages..." while the reader works and "5 pages ready to
 * check" with Check now once it is done, the same as the app.
 */

export interface PageQueues {
  queues: { batchId: string; pages: number; ready: boolean }[];
  /** Pages left today: null has no limit. */
  left: number | null;
}

/** How often a binder with a queue still being read looks again. */
export const QUEUE_POLL_MS = 15_000;

/**
 * The queues on a binder, kept fresh: read once when the page did not
 * bring them, again every QUEUE_POLL_MS while one is being read and the
 * tab is in view, and whenever the tab comes back into view.
 */
export function usePageQueues(
  binderId: string,
  enabled: boolean,
  initial: PageQueues | null,
): PageQueues & { known: boolean; refresh: () => void } {
  const [state, setState] = useState<PageQueues | null>(initial);

  const refresh = useCallback(() => {
    if (!enabled) return;
    queuesForAction(binderId)
      .then(setState)
      .catch(() => {});
  }, [binderId, enabled]);

  /* A refresh of the page brings the server's newer copy. */
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    if (initial) setState(initial);
  }

  /* Not brought by the page (the binder opened by its public link). */
  const [ask] = useState(initial === null);
  useEffect(() => {
    if (ask) refresh();
  }, [ask, refresh]);

  const reading = state?.queues.some((queue) => !queue.ready) ?? false;
  useEffect(() => {
    if (!enabled) return;
    const look = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    const timer = reading ? window.setInterval(look, QUEUE_POLL_MS) : null;
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [enabled, reading, refresh]);

  return {
    queues: state?.queues ?? [],
    left: state?.left ?? null,
    known: state !== null,
    refresh,
  };
}

/**
 * One banner per queue out on this binder, over its pockets: the line
 * alone while it is read, Check now beside it once it is.
 */
export function QueueBanners({
  queues,
  onCheck,
}: {
  queues: PageQueues["queues"];
  onCheck: (batchId: string) => void;
}) {
  if (queues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {queues.map((queue) => (
        <li
          key={queue.batchId}
          className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2"
        >
          <ScanLine className="size-5 shrink-0 text-accent" aria-hidden="true" />
          <p
            role="status"
            className="min-w-0 flex-1 text-sm font-semibold text-text-primary"
          >
            {pagesWaitingLine(queue.pages, queue.ready)}
          </p>
          {queue.ready && (
            <Button type="button" size="sm" onClick={() => onCheck(queue.batchId)}>
              {CHECK_NOW}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
