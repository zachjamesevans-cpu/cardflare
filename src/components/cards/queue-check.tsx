"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { PageAlign, startCorners } from "@/components/cards/page-align";
import {
  PageCheck,
  type CheckedPage,
  type Choice,
  type Pocket,
} from "@/components/cards/page-check";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { Quad } from "@/lib/cards/page-geometry";
import {
  discardQueueAction,
  placeQueueAction,
  queueViewAction,
  realignPageAction,
  rescanPocketAction,
} from "@/lib/cards/page-job-actions";
import type { QueuedPage } from "@/lib/cards/page-jobs";
import {
  CANCEL_PLACING,
  CHECK_PAGES,
  MOVE_AND_PLACE,
  PAGE_FAILED,
  PAGE_NEEDS_LINING_UP,
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
 *    this same queue. One whose pockets could not be found says so, with
 *    "Line up the page" (`PageAlign`) before Retake: the player's corners
 *    go back to the reader and the page reads "Reading..." again. A pocket
 *    read again from the viewer replaces that pocket here.
 * 2. "Add 5 pages to binder": every chosen card into the very pocket it
 *    sat in, `pocketAt(page, slot)`. Sent first as "ask": the server
 *    counts a second copy up and, if a pocket already holds a different
 *    card, places nothing and asks. The question takes the footer's
 *    place, "Move them and place" sending again as "replace" (those
 *    cards go to the back of the binder) and Cancel leaving the check as
 *    it was. Placed, the server says so in one sentence and closes the
 *    queue.
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
  if (error === "needs-alignment") return PAGE_NEEDS_LINING_UP;
  return error === "timeout" ? PAGE_TOOK_TOO_LONG : PAGE_FAILED;
}

/** A page whose pockets could not be found, and whose photo is there to line up. */
export function canLineUp(
  page: Pick<QueuedPage, "status" | "error" | "photos">,
): boolean {
  return (
    page.status === "failed" &&
    page.error === "needs-alignment" &&
    page.photos.page !== null
  );
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
  /* A pocket already holds another card: the server's question, until answered. */
  const [asking, setAsking] = useState<string | null>(null);
  /* The page being lined up, by its scan id. */
  const [lining, setLining] = useState<string | null>(null);
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

  /*
   * One pocket read again: its new answer in place of the old, and its
   * card back to the new best guess. Whether it came.
   */
  const rescan = async (scanId: string, slot: number): Promise<boolean> => {
    const result = await rescanPocketAction(scanId, slot).catch(() => null);
    if (!result?.ok) return false;
    const { pocket } = result;
    setPages(
      (before) =>
        before?.map((page) =>
          page.scanId === scanId && page.pockets
            ? {
                ...page,
                pockets: page.pockets.map((each) =>
                  each.slot === slot ? pocket : each,
                ),
              }
            : page,
        ) ?? before,
    );
    setPicked((all) => {
      const current = all[scanId];
      if (!current) return all;
      const fresh = firstChoices([pocket])[slot] ?? null;
      return {
        ...all,
        [scanId]: current.map((each, at) => (at === slot ? fresh : each)),
      };
    });
    return true;
  };

  /*
   * The player's corners for a page: sent, and the page back to
   * "Reading..." here, which starts the looks again until it has read.
   */
  const realign = async (scanId: string, corners: Quad): Promise<boolean> => {
    const result = await realignPageAction(scanId, corners).catch(() => ({
      ok: false,
    }));
    if (!result.ok) return false;
    setPages(
      (before) =>
        before?.map((page) =>
          page.scanId === scanId ? { ...page, status: "queued", error: null } : page,
        ) ?? before,
    );
    setLining(null);
    return true;
  };
  const lined = pages?.find((page) => page.scanId === lining && canLineUp(page));

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
      onLineUp: canLineUp(page) ? () => setLining(page.scanId) : undefined,
      blurry: page.vision?.blurry ?? false,
    };
  });

  /*
   * "ask" first: nothing is moved without a yes. A pocket that already
   * holds another card comes back as the question; "replace" is the yes.
   */
  const place = (mode: "ask" | "replace") => {
    if (!batchId || pending || waiting || placements.length === 0) return;
    setError(null);
    setAsking(null);
    start(async () => {
      const result = await placeQueueAction(batchId, { placements }, mode).catch(
        () => ({
          ok: false as const,
          message: SCAN_REFUSALS.unavailable,
          occupied: undefined,
        }),
      );
      if (!result.ok) {
        if (mode === "ask" && result.occupied && result.occupied.length > 0) {
          setAsking(result.message);
        } else {
          setError(result.message);
        }
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
            {asking ? (
              /* The server's question in the footer's place: move the
                 cards in those pockets aside and place, or leave it. */
              <div
                role="alertdialog"
                aria-label={asking}
                className="flex flex-col gap-2"
              >
                <p className="text-sm text-text-primary">{asking}</p>
                <Button
                  type="button"
                  className="w-full"
                  disabled={pending}
                  onClick={() => place("replace")}
                >
                  {MOVE_AND_PLACE}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={pending}
                  onClick={() => setAsking(null)}
                >
                  {CANCEL_PLACING}
                </Button>
              </div>
            ) : (
              <>
                {/* Placing ends the queue, so it waits for every page to be
                    read or to have failed: a page still reading is never
                    thrown away by it. */}
                <Button
                  type="button"
                  className="w-full"
                  disabled={pending || waiting || placements.length === 0}
                  onClick={() => place("ask")}
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
              </>
            )}
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
          onRescan={rescan}
        />
      ) : (
        <div role="status" className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}
      {lined?.photos.page && (
        <PageAlign
          key={lined.scanId}
          photo={lined.photos.page}
          start={startCorners(lined.vision)}
          onRead={(corners) => realign(lined.scanId, corners)}
          onClose={() => setLining(null)}
        />
      )}
    </Sheet>
  );
}
