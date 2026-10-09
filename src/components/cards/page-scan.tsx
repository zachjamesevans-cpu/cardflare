"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Camera, Minus, Plus } from "lucide-react";

import {
  PageCheck,
  type CheckedPage,
  type Choice,
  type Pocket,
} from "@/components/cards/page-check";
import { fitJpeg, scanSize } from "@/components/cards/scan-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { placeBinderPagesAction } from "@/lib/binder/actions";
import { scanPageAction } from "@/lib/cards/scan-actions";
import {
  BACK_TO_PAGES,
  BINDER_PAGES,
  CHECK_PAGES,
  MAX_SCAN_PAGES,
  PAGE_FAILED,
  PAGES_HINT,
  POCKETS_PER_PAGE,
  READING_PAGE,
  REMOVE_PAGE,
  RETAKE,
  SCAN_REFUSALS,
  START_EARLIER,
  START_LATER,
  addPagesLabel,
  firstEmptyPage,
  pageStatusLine,
  pocketAt,
  pocketCrop,
  startingAtLine,
  takePageLabel,
  type ScanRefusal,
} from "@/lib/cards/scan-rules";

/**
 * Scanning whole binder pages, on the Add cards sheet's "Scan a card"
 * tab behind "Whole pages".
 *
 * The founder (2026-10-09): "would be cool if someone could scan, let's
 * say 5 pages of their binder into a queue and it auto fills in an
 * actual binder, with the exact same location the cards were in in
 * their binder." In this order, the same as the app:
 *
 * 1. "Starting at page 4", the first page past this binder's last card
 *    unless the player steps it, and the hint.
 * 2. "Take page 4", a file input that on a phone opens the camera. Each
 *    photo is cut here, in the browser, into its nine pockets with
 *    `pocketCrop`, each shrunk to SCAN_LONG_EDGE as one card is, and
 *    queued. The queue is read in the background, one page at a time
 *    in queue order, while the player shoots the next. A page's number
 *    is its place in the queue from the starting page, so removing one
 *    renumbers the pages after it.
 * 3. "Check the pages": every page as its 3x3 grid, to change before
 *    anything is placed (`PageCheck`).
 * 4. "Add 5 pages to binder": every chosen card into the very pocket
 *    it sat in, `pocketAt(page, slot)`. The server counts a second copy
 *    up, never writes over a full pocket, and says so in one sentence.
 *
 * Nothing from here goes in the sheet's tray; the pages are placed by
 * their own action, and only from the check.
 */

type Status =
  | { kind: "waiting" }
  | { kind: "read"; pockets: Pocket[]; choices: Choice[] }
  | { kind: "failed"; reason: ScanRefusal | null };

interface QueuedPage {
  id: number;
  /** The whole photo, small, for the queue's row; null while it is cut. */
  thumb: string | null;
  /** The nine pockets as they are sent; null while the photo is cut. */
  cells: Blob[] | null;
  /** The same pockets as pictures, for the check. */
  cellUrls: string[];
  status: Status;
}

/** A read page's count: pockets with a card in them, and the ones found. */
export function pageTally(pockets: readonly Pocket[]): {
  found: number;
  cards: number;
} {
  return {
    found: pockets.filter((pocket) => pocket.state === "found").length,
    cards: pockets.filter((pocket) => pocket.state !== "empty").length,
  };
}

/** Each pocket's card to start the check with: the best guess, where there is one. */
export function firstChoices(pockets: readonly Pocket[]): Choice[] {
  return Array.from({ length: POCKETS_PER_PAGE }, (_, slot) => {
    const pocket = pockets.find((each) => each.slot === slot);
    const top = pocket?.state === "found" ? pocket.matches[0] : undefined;
    return top ? { card: top.card, printingId: top.printingId } : null;
  });
}

/**
 * What placing sends: every chosen card, in the pocket it sat in. The
 * queue's first page is `startPage`; a page that did not read, and a
 * pocket left empty, send nothing.
 */
export function pagePlacements(
  pages: readonly (readonly Choice[] | null)[],
  startPage: number,
): { pocket: number; cardId: string; printingId: string | null }[] {
  return pages.flatMap((choices, index) =>
    (choices ?? []).flatMap((choice, slot) =>
      choice
        ? [
            {
              pocket: pocketAt(startPage + index, slot),
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

/** What a page that did not read says. A thrown error has no reason. */
export function pageFailedLine(reason: ScanRefusal | null): string {
  return reason ? SCAN_REFUSALS[reason] : PAGE_FAILED;
}

/** A page just shot: waiting to be cut, then read. */
function blank(id: number): QueuedPage {
  return { id, thumb: null, cells: null, cellUrls: [], status: { kind: "waiting" } };
}

/** The queue row's picture: the long side this many pixels. */
const THUMB_EDGE = 160;

/**
 * A photo of a page cut into its nine pockets, each upright, shrunk to
 * SCAN_LONG_EDGE on its long side (never enlarged) and a JPEG under
 * SCAN_MAX_BYTES, and a small picture of the whole page for the queue.
 * Null when a pocket will not fit; throws when the browser cannot open
 * the file.
 */
export async function cutPage(
  file: Blob,
): Promise<{ cells: Blob[]; thumb: Blob | null } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const cells: Blob[] = [];
    for (let slot = 0; slot < POCKETS_PER_PAGE; slot += 1) {
      const crop = pocketCrop(slot, width, height);
      const size = scanSize(crop.width, crop.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        size.width,
        size.height,
      );
      const cell = await fitJpeg(canvas);
      if (!cell) return null;
      cells.push(cell);
    }

    const scale = Math.min(1, THUMB_EDGE / Math.max(width, height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, "image/jpeg", 0.7),
    );
    return { cells, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One page to the reader: the nine pockets, "cell0" to "cell8". */
async function readPage(cells: Blob[]): Promise<Status> {
  const form = new FormData();
  cells.forEach((cell, slot) => form.append(`cell${slot}`, cell, `pocket${slot}.jpg`));
  try {
    const outcome = await scanPageAction(form);
    return outcome.ok
      ? {
          kind: "read",
          pockets: outcome.pockets,
          choices: firstChoices(outcome.pockets),
        }
      : { kind: "failed", reason: outcome.reason };
  } catch {
    return { kind: "failed", reason: null };
  }
}

export function PageScan({
  binderId,
  imagesEnabled,
  playerGames,
  pockets,
  onPlaced,
}: {
  binderId: string;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** The pockets this binder already has a card in. */
  pockets: readonly number[];
  /** The action's sentence, and the first pocket filled. */
  onPlaced: (message: string, firstPocket: number | null) => void;
}) {
  const [startPage, setStartPage] = useState(() => firstEmptyPage(pockets));
  const [queue, setQueue] = useState<QueuedPage[]>([]);
  const [step, setStep] = useState<"shoot" | "check">("shoot");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  /* The failed page a Retake is replacing, until its photo arrives. */
  const retaking = useRef<number | null>(null);
  /* A page is with the reader. One at a time, so this is a flag. */
  const reading = useRef(false);
  /* Every picture made, so the last ones go when the sheet closes. */
  const made = useRef(new Set<string>());

  const taken = new Set(pockets);

  useEffect(() => {
    const urls = made.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  /*
   * The reader: the first page still waiting, in queue order, once it
   * has been cut. The answer lands on the page by its id, so a page
   * removed while it was read is simply not there to land on.
   */
  useEffect(() => {
    if (reading.current) return;
    const next = queue.find((page) => page.status.kind === "waiting");
    if (!next?.cells) return;
    reading.current = true;
    void readPage(next.cells).then((status) => {
      reading.current = false;
      setQueue((current) =>
        current.map((page) => (page.id === next.id ? { ...page, status } : page)),
      );
    });
  }, [queue]);

  const picture = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    made.current.add(url);
    return url;
  };
  const release = (page: QueuedPage) => {
    for (const url of [page.thumb, ...page.cellUrls]) {
      if (!url) continue;
      URL.revokeObjectURL(url);
      made.current.delete(url);
    }
  };

  const shoot = async (file: File) => {
    const replacing = retaking.current;
    retaking.current = null;
    let id: number;
    if (replacing !== null) {
      id = replacing;
      const old = queue.find((page) => page.id === id);
      if (old) release(old);
      setQueue((current) => current.map((page) => (page.id === id ? blank(id) : page)));
    } else {
      if (queue.length >= MAX_SCAN_PAGES) return;
      id = nextId.current;
      nextId.current += 1;
      setQueue((current) => [...current, blank(id)]);
    }

    let cut: Pick<QueuedPage, "thumb" | "cells" | "cellUrls"> | null = null;
    let status: Status | null = null;
    try {
      const pieces = await cutPage(file);
      if (pieces) {
        cut = {
          thumb: pieces.thumb ? picture(pieces.thumb) : null,
          cells: pieces.cells,
          cellUrls: pieces.cells.map(picture),
        };
      } else {
        status = { kind: "failed", reason: "too-big" };
      }
    } catch {
      /* Not a picture this browser can open: nothing in it to read. */
      status = { kind: "failed", reason: "no-card" };
    }
    setQueue((current) =>
      current.map((page) => {
        if (page.id !== id) return page;
        if (cut) return { ...page, ...cut };
        return status ? { ...page, status } : page;
      }),
    );
  };

  const remove = (page: QueuedPage) => {
    release(page);
    setQueue((current) => current.filter((each) => each.id !== page.id));
  };

  const choose = (pageId: number, slot: number, choice: Choice) =>
    setQueue((current) =>
      current.map((page) =>
        page.id === pageId && page.status.kind === "read"
          ? {
              ...page,
              status: {
                ...page.status,
                choices: page.status.choices.map((each, at) =>
                  at === slot ? choice : each,
                ),
              },
            }
          : page,
      ),
    );

  const choices = queue.map((page) =>
    page.status.kind === "read" ? page.status.choices : null,
  );
  const placements = pagePlacements(choices, startPage);
  const chosen = pagesChosen(choices);

  const place = () => {
    if (pending || placements.length === 0) return;
    setError(null);
    start(async () => {
      const result = await placeBinderPagesAction(binderId, { placements });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onPlaced(result.message, result.firstPocket);
    });
  };

  const nextPage = startPage + queue.length;
  /* A page to take only while the queue and the binder have room for it. */
  const canTake = queue.length < MAX_SCAN_PAGES && nextPage <= BINDER_PAGES;
  /* The starting page never pushes the queue off the binder's last page. */
  const lastStart = BINDER_PAGES - Math.max(0, queue.length - 1);
  const anyRead = queue.some((page) => page.status.kind === "read");

  const checked: CheckedPage[] = queue.map((page, index) => ({
    id: page.id,
    page: startPage + index,
    cellUrls: page.cellUrls,
    read:
      page.status.kind === "read"
        ? { pockets: page.status.pockets, choices: page.status.choices }
        : null,
    line:
      page.status.kind === "failed" ? pageFailedLine(page.status.reason) : READING_PAGE,
  }));

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Opened by a button alone: a tap is the only way the camera opens. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          /* Cleared, so the same photo picked twice still counts. */
          event.target.value = "";
          if (file) void shoot(file);
          else retaking.current = null;
        }}
      />

      {step === "shoot" ? (
        <>
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong px-4 py-6 text-center">
            <div className="flex items-center gap-3">
              <StepButton
                label={START_EARLIER}
                disabled={startPage <= 1}
                onClick={() => setStartPage((page) => Math.max(1, page - 1))}
              >
                <Minus className="size-4" aria-hidden="true" />
              </StepButton>
              <p
                aria-live="polite"
                className="text-sm font-semibold text-text-primary tabular-nums"
              >
                {startingAtLine(startPage)}
              </p>
              <StepButton
                label={START_LATER}
                disabled={startPage >= lastStart}
                onClick={() => setStartPage((page) => Math.min(lastStart, page + 1))}
              >
                <Plus className="size-4" aria-hidden="true" />
              </StepButton>
            </div>
            <p className="max-w-xs text-sm text-text-secondary">{PAGES_HINT}</p>
            {canTake && (
              <Button
                type="button"
                onClick={() => {
                  retaking.current = null;
                  input.current?.click();
                }}
              >
                <Camera className="size-4" aria-hidden="true" />
                {takePageLabel(nextPage)}
              </Button>
            )}
          </div>

          {queue.length > 0 && (
            <ul className="flex flex-col gap-2">
              {queue.map((page, index) => (
                <QueueRow
                  key={page.id}
                  page={page}
                  number={startPage + index}
                  onRetake={() => {
                    retaking.current = page.id;
                    input.current?.click();
                  }}
                  onRemove={() => remove(page)}
                />
              ))}
            </ul>
          )}

          {anyRead && (
            <Dock>
              <Button type="button" className="w-full" onClick={() => setStep("check")}>
                {CHECK_PAGES}
              </Button>
            </Dock>
          )}
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={pending}
            onClick={() => setStep("shoot")}
          >
            {BACK_TO_PAGES}
          </Button>
          <PageCheck
            pages={checked}
            taken={taken}
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            onChoose={choose}
          />
          <Dock>
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
            <Button
              type="button"
              className="w-full"
              disabled={pending || placements.length === 0}
              onClick={place}
            >
              {addPagesLabel(chosen)}
            </Button>
          </Dock>
        </>
      )}
    </div>
  );
}

/** The step's one action, kept in reach at the bottom of the sheet as the page scrolls. */
function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-surface px-4 py-3">
      {children}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-border bg-elevated text-text-primary transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A queued page: its picture, how its read is going, Retake when it failed, Remove always. */
function QueueRow({
  page,
  number,
  onRetake,
  onRemove,
}: {
  page: QueuedPage;
  number: number;
  onRetake: () => void;
  onRemove: () => void;
}) {
  const { status } = page;
  const line =
    status.kind === "read"
      ? (() => {
          const tally = pageTally(status.pockets);
          return pageStatusLine(number, tally.found, tally.cards);
        })()
      : status.kind === "failed"
        ? pageFailedLine(status.reason)
        : READING_PAGE;
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-2">
      <span className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-elevated">
        {page.thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={page.thumb} alt="" className="size-full object-cover" />
        ) : (
          status.kind === "waiting" && <Spinner size="sm" />
        )}
      </span>
      <p
        role={status.kind === "failed" ? "alert" : undefined}
        className={
          status.kind === "failed"
            ? "min-w-0 flex-1 text-sm text-text-primary"
            : "min-w-0 flex-1 text-sm text-text-secondary"
        }
      >
        {status.kind === "waiting" && page.thumb && (
          <Spinner size="sm" className="mr-1.5 inline-block align-[-2px]" />
        )}
        {line}
      </p>
      {status.kind === "failed" && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetake}>
          {RETAKE}
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        {REMOVE_PAGE}
      </Button>
    </li>
  );
}
