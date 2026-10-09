"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  PageCheck,
  type CheckedPage,
  type Choice,
  type Pocket,
} from "@/components/cards/page-check";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  discardQueueAction,
  placeQueueAction,
  queueViewAction,
} from "@/lib/cards/page-job-actions";
import type { QueuedPage } from "@/lib/cards/page-jobs";
import {
  CHECK_PAGES,
  PAGE_FAILED,
  PAGE_TOOK_TOO_LONG,
  POCKETS_PER_PAGE,
  READING_PAGE,
  SCAN_REFUSALS,
  THROW_PAGES_AWAY,
  addPagesLabel,
  pocketAt,
} from "@/lib/cards/scan-rules";

/**
 * Checking a queue of pages read in the background, opened from the
 * binder's banner ("5 pages ready to check", Check now) or from the
 * notice, which links to the binder with `?scan=<batchId>`.
 *
 * The founder agreed nothing is placed before the player has looked, so
 * this is the same 3x3 check as ever (`PageCheck`), drawn from the
 * server's queue: its photos are links to the player's own copies, and
 * every page carries its own number. In this order, the same as the app:
 *
 * 1. Every page, by its number. A read page is its grid; one still being
 *    read says "Reading..." with the spinner, and the queue is looked at
 *    again every CHECK_POLL_MS until none is; one that did not read says
 *    why, with Retake, which goes back to the camera for that page in
 *    this same queue.
 * 2. "Add 5 pages to binder": every chosen card into the very pocket it
 *    sat in, `pocketAt(page, slot)`. The server counts a second copy up,
 *    never writes over a full pocket, says so in one sentence, and
 *    closes the queue.
 * 3. "Throw these pages away", asked once more first: nothing placed,
 *    the photos gone.
 */

/** How often a check with a page still being read looks again. */
export const CHECK_POLL_MS = 10_000;

/** Each pocket's card to start the check with: the best guess, where there is one. */
export function firstChoices(pockets: readonly Pocket[]): Choice[] {
  return Array.from({ length: POCKETS_PER_PAGE }, (_, slot) => {
    const pocket = pockets.find((each) => each.slot === slot);
    const top = pocket?.state === "found" ? pocket.matches[0] : undefined;
    return top ? { card: top.card, printingId: top.printingId } : null;
  });
}

/**
 * What placing sends: every chosen card, in the pocket it sat in, on the
 * page the photo was of. A page that did not read, and a pocket left
 * empty, send nothing.
 */
export function pagePlacements(
  pages: readonly { page: number; choices: readonly Choice[] | null }[],
): { pocket: number; cardId: string; printingId: string | null }[] {
  return pages.flatMap(({ page, choices }) =>
    (choices ?? []).flatMap((choice, slot) =>
      choice
        ? [
            {
              pocket: pocketAt(page, slot),
              cardId: choice.card.id,
              printingId: choice.printingId,
            },
          ]
        : [],
    ),
  );
}

/** The pages with at least one card chosen: the number on the Add button. */
export function pagesChosen(pages: readonly (readonly Choice[] | null)[]): number {
  return pages.filter((choices) => choices?.some(Boolean)).length;
}

/** What a page that did not read says. */
export function failedPageLine(error: string | null): string {
  return error === "timeout" ? PAGE_TOOK_TOO_LONG : PAGE_FAILED;
}

/** Still with the reader. */
export function stillReading(page: Pick<QueuedPage, "status">): boolean {
  return page.status === "queued" || page.status === "reading";
}

/**
 * A fresh look at the queue over the last: a page that had read keeps
 * what it had, photo links and all, so its pictures do not reload.
 */
export function mergePages(
  before: readonly QueuedPage[] | null,
  after: readonly QueuedPage[],
): QueuedPage[] {
  return after.map(
    (page) =>
      before?.find((each) => each.scanId === page.scanId && each.status === "ready") ??
      page,
  );
}

export function QueueCheck({
  batchId,
  imagesEnabled,
  playerGames,
  taken,
  onClose,
  onPlaced,
  onRetake,
}: {
  /** The queue to check; null draws nothing. */
  batchId: string | null;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** Pockets this binder already has a card in. */
  taken: ReadonlySet<number>;
  /** Closed, thrown away, or the queue is gone. */
  onClose: () => void;
  /** The action's sentence, and the first pocket a card was placed in. */
  onPlaced: (message: string, firstPocket: number | null) => void;
  /** Retake on a page that did not read; null when the camera is not the player's. */
  onRetake: ((page: number) => void) | null;
}) {
  const [pages, setPages] = useState<QueuedPage[] | null>(null);
  /* The player's picks, by page; a page not in here starts on its guesses. */
  const [picked, setPicked] = useState<Record<string, Choice[]>>({});
  const [error, setError] = useState<string | null>(null);
  /* Looks that did not get through: each is tried again a poll later. */
  const [misses, setMisses] = useState(0);
  const [pending, start] = useTransition();

  const waiting = pages?.some(stillReading) ?? false;

  /* The latest close, for the poll to call without starting over. */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  /*
   * The queue, once at the start, then again every CHECK_POLL_MS while
   * any page is still with the reader. Each answer sets the next look.
   */
  useEffect(() => {
    if (!batchId) return;
    if (pages !== null && !waiting) return;
    let live = true;
    const load = async () => {
      const view = await queueViewAction(batchId).catch(() => undefined);
      if (!live) return;
      if (view === undefined) {
        setMisses((count) => count + 1);
        return;
      }
      /* Placed or thrown away elsewhere: nothing here to check. */
      if (view === null) {
        close.current();
        return;
      }
      setPages((before) => mergePages(before, view.pages));
    };
    const first = pages === null && misses === 0;
    const timer = window.setTimeout(load, first ? 0 : CHECK_POLL_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [batchId, waiting, pages, misses]);

  const choicesOf = (page: QueuedPage): Choice[] | null =>
    page.status === "ready"
      ? (picked[page.scanId] ?? firstChoices(page.pockets ?? []))
      : null;

  const choose = (scanId: string, slot: number, choice: Choice) => {
    const page = pages?.find((each) => each.scanId === scanId);
    const current = page ? choicesOf(page) : null;
    if (!current) return;
    setPicked((all) => ({
      ...all,
      [scanId]: current.map((each, at) => (at === slot ? choice : each)),
    }));
  };

  const all = (pages ?? []).map((page) => ({
    page: page.page,
    choices: choicesOf(page),
  }));
  const placements = pagePlacements(all);
  const chosen = pagesChosen(all.map((page) => page.choices));

  const checked: CheckedPage[] = (pages ?? []).map((page) => {
    const choices = choicesOf(page);
    return {
      id: page.scanId,
      page: page.page,
      cellUrls: page.photos.pockets,
      read:
        page.status === "ready" && choices
          ? { pockets: page.pockets ?? [], choices }
          : null,
      line: stillReading(page) ? READING_PAGE : failedPageLine(page.error),
      reading: stillReading(page),
      onRetake:
        page.status === "failed" && onRetake ? () => onRetake(page.page) : undefined,
    };
  });

  const place = () => {
    if (!batchId || pending || waiting || placements.length === 0) return;
    setError(null);
    start(async () => {
      const result = await placeQueueAction(batchId, { placements });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onPlaced(result.message, Math.min(...placements.map((each) => each.pocket)));
    });
  };

  const throwAway = () => {
    if (!batchId || pending) return;
    if (!window.confirm(`${THROW_PAGES_AWAY}?`)) return;
    setError(null);
    start(async () => {
      const result = await discardQueueAction(batchId).catch(() => ({ ok: false }));
      if (!result.ok) {
        setError(SCAN_REFUSALS.unavailable);
        return;
      }
      onClose();
    });
  };

  return (
    <Sheet
      open={batchId !== null}
      onClose={onClose}
      title={CHECK_PAGES}
      footer={
        pages && (
          <div className="flex flex-col gap-2">
            {(error || pending) && (
              <div className="flex min-h-5 items-center gap-2 text-sm">
                {pending && <Spinner size="sm" />}
                {error && (
                  <span role="alert" className="text-danger">
                    {error}
                  </span>
                )}
              </div>
            )}
            {/* Placing ends the queue, so it waits for every page to be
                read or to have failed: a page still reading is never
                thrown away by it. */}
            <Button
              type="button"
              className="w-full"
              disabled={pending || waiting || placements.length === 0}
              onClick={place}
            >
              {addPagesLabel(chosen)}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={pending}
              onClick={throwAway}
            >
              {THROW_PAGES_AWAY}
            </Button>
          </div>
        )
      }
    >
      {pages ? (
        <PageCheck
          pages={checked}
          taken={taken}
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          onChoose={choose}
        />
      ) : (
        <div role="status" className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
    </Sheet>
  );
}
