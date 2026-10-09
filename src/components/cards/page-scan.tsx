"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Minus, Plus } from "lucide-react";

import { QUALITIES, scanSize } from "@/components/cards/scan-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { sendPageAction } from "@/lib/cards/page-job-actions";
import type { PageSendRefusal } from "@/lib/cards/page-jobs";
import {
  BINDER_PAGES,
  DONE_SCANNING,
  MAX_SCAN_PAGES,
  PAGE_SENT,
  PAGES_HINT,
  POCKETS_PER_PAGE,
  QUEUE_FULL,
  READING_IN_BACKGROUND,
  REMOVE_PAGE,
  RETAKE,
  SCAN_MAX_BYTES,
  SCAN_REFUSALS,
  SENDING_PAGE,
  START_EARLIER,
  START_LATER,
  firstEmptyPage,
  pagesLeftLine,
  pocketCrop,
  startingAtLine,
  takePageLabel,
} from "@/lib/cards/scan-rules";

/**
 * Scanning whole binder pages, on the Add cards sheet's "Scan a card"
 * tab behind "Whole pages".
 *
 * The founder (2026-10-09): "the full binder page scans should be fully
 * agentic. It is a further away picture, often with glare inside a
 * binder, so it's best to have it do a full pass. Maybe it scans it, and
 * then they'll get a notification once it's ready." So this step only
 * shoots and sends; the careful reader works on the server, and the
 * check opens later, from the binder's banner or the notice
 * (`QueueCheck`). In this order, the same as the app:
 *
 * 1. "Starting at page 4", the first page past this binder's last card
 *    unless the player steps it, and the hint.
 * 2. "Take page 4", a file input that on a phone opens the camera, and
 *    "18 of 20 pages left today" under it. Each photo is cut here, in
 *    the browser: the whole page at PAGE_LONG_EDGE for the reader to
 *    see the page as a page, and its nine pockets with `pocketCrop`.
 * 3. Each page is sent, one at a time in queue order, while the player
 *    shoots the next: "Sending...", then "Sent". A refused page says
 *    why and offers Retake, which sends the same page number again, and
 *    Remove; a page that went is on the server, and only the check
 *    throws it away. The first page is stepped only before a shot.
 * 4. Once a page is sent, "Reading your pages..." and Done, which
 *    closes the sheet as soon as the sends still out have landed. The
 *    sheet never waits for a page to be read.
 *
 * Every page of one queue carries the same `batchId`, made once, so the
 * server reads them as one queue and sends one notice. A retake from
 * the check comes back here with that queue's batchId and the page's
 * own number, and sending it replaces the page.
 */

/** The whole page's photo: this long on its long side, for the careful reader. */
export const PAGE_LONG_EDGE = 1568;
/**
 * All one page sends, the photo and its nine pockets, kept under the
 * Server Action's four megabytes with room for the form around it.
 */
const PAGE_FORM_BYTES = 3_500_000;
/** The queue row's picture: the long side this many pixels. */
const THUMB_EDGE = 160;

type Status =
  { kind: "waiting" } | { kind: "sent" } | { kind: "failed"; reason: PageSendRefusal };

interface ShotPage {
  id: number;
  /** The binder page this photo is of, fixed when it is taken. */
  number: number;
  /** The whole photo, small, for the queue's row; null while it is cut. */
  thumb: string | null;
  /** What is sent; null while the photo is cut, and once it has gone. */
  photos: { page: Blob; cells: Blob[] } | null;
  status: Status;
}

/** What a page that was not sent says. */
export function sendRefusalLine(reason: PageSendRefusal): string {
  if (reason === "queue-full") return QUEUE_FULL;
  if (reason === "not-yours") return SCAN_REFUSALS.unavailable;
  return SCAN_REFUSALS[reason];
}

/** The size a photo is drawn at: `edge` on the long side, never larger. */
function sizeAt(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((done) => canvas.toBlob(done, "image/jpeg", quality));
}

/**
 * A photo of a page, ready to send: its nine pockets, each upright and
 * shrunk to SCAN_LONG_EDGE on its long side (never enlarged), the whole
 * page at PAGE_LONG_EDGE, every one a JPEG under SCAN_MAX_BYTES and all
 * of them together under PAGE_FORM_BYTES, stepping the quality down
 * until they fit; and a small picture of the page for the queue. Null
 * when they never fit; throws when the browser cannot open the file.
 */
export async function cutPage(
  file: Blob,
): Promise<{ page: Blob; cells: Blob[]; thumb: Blob | null } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const draw = (
      crop: { x: number; y: number; width: number; height: number },
      size: { width: number; height: number },
    ) => {
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
      return canvas;
    };

    const pockets: HTMLCanvasElement[] = [];
    for (let slot = 0; slot < POCKETS_PER_PAGE; slot += 1) {
      const crop = pocketCrop(slot, width, height);
      const size = scanSize(crop.width, crop.height);
      const canvas = draw(crop, size);
      if (!canvas) return null;
      pockets.push(canvas);
    }
    const whole = draw(
      { x: 0, y: 0, width, height },
      sizeAt(width, height, PAGE_LONG_EDGE),
    );
    if (!whole) return null;

    let sent: { page: Blob; cells: Blob[] } | null = null;
    for (const quality of QUALITIES) {
      const cells = await Promise.all(pockets.map((canvas) => jpeg(canvas, quality)));
      const page = await jpeg(whole, quality);
      if (!page || cells.some((cell) => !cell)) continue;
      const fitted = cells as Blob[];
      const total = fitted.reduce((sum, cell) => sum + cell.size, page.size);
      if (
        page.size <= SCAN_MAX_BYTES &&
        fitted.every((cell) => cell.size <= SCAN_MAX_BYTES) &&
        total <= PAGE_FORM_BYTES
      ) {
        sent = { page, cells: fitted };
        break;
      }
    }
    if (!sent) return null;

    const small = sizeAt(width, height, THUMB_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = small.width;
    canvas.height = small.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumb = await jpeg(canvas, 0.7);
    return { ...sent, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One page to the server: the whole photo as "page", the nine pockets "pocket0" to "pocket8". */
async function sendPage(
  binderId: string,
  batchId: string,
  pageNumber: number,
  photos: { page: Blob; cells: Blob[] },
): Promise<{ status: Status; left?: number | null }> {
  const form = new FormData();
  form.append("binderId", binderId);
  form.append("batchId", batchId);
  form.append("pageNumber", String(pageNumber));
  form.append("page", photos.page, "page.jpg");
  photos.cells.forEach((cell, slot) =>
    form.append(`pocket${slot}`, cell, `pocket${slot}.jpg`),
  );
  try {
    const outcome = await sendPageAction(form);
    return outcome.ok
      ? { status: { kind: "sent" }, left: outcome.left }
      : { status: { kind: "failed", reason: outcome.reason } };
  } catch {
    return { status: { kind: "failed", reason: "unavailable" } };
  }
}

/** A page just shot: waiting to be cut, then sent. */
function blank(id: number, number: number): ShotPage {
  return { id, number, thumb: null, photos: null, status: { kind: "waiting" } };
}

export function PageScan({
  binderId,
  pockets,
  left: leftAtOpen,
  retake = null,
  onDone,
}: {
  binderId: string;
  /** The pockets this binder already has a card in. */
  pockets: readonly number[];
  /** Pages left today: null has no limit, undefined is not known yet. */
  left?: number | null;
  /** A page of a queue already out, shot again: that queue, that page. */
  retake?: { batchId: string; page: number } | null;
  /** Every page sent, or given up on: the sheet closes. */
  onDone: () => void;
}) {
  /* One queue, one id, made once: every page sent from this sheet joins it. */
  const [batchId] = useState(() => retake?.batchId ?? crypto.randomUUID());
  const [startPage, setStartPage] = useState(
    () => retake?.page ?? firstEmptyPage(pockets),
  );
  const [queue, setQueue] = useState<ShotPage[]>([]);
  const [left, setLeft] = useState(leftAtOpen);
  /* Done was pressed: the sheet closes once the sends still out land. */
  const [finishing, setFinishing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  /* The failed page a Retake is replacing, until its photo arrives. */
  const retaking = useRef<number | null>(null);
  /* A page is on its way. One at a time, so this is a flag. */
  const sending = useRef(false);
  /* Every picture made, so the last ones go when the sheet closes. */
  const made = useRef(new Set<string>());

  /* The figure the binder read can arrive after the sheet opened. */
  const [leftSeen, setLeftSeen] = useState(leftAtOpen);
  if (leftSeen !== leftAtOpen) {
    setLeftSeen(leftAtOpen);
    if (left === undefined) setLeft(leftAtOpen);
  }

  useEffect(() => {
    const urls = made.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  /*
   * The sender: the first page still waiting, in queue order, once it
   * has been cut. A page is sent and never read here; the answer is
   * only whether the server has it.
   */
  useEffect(() => {
    if (sending.current) return;
    const next = queue.find((page) => page.status.kind === "waiting");
    if (!next?.photos) return;
    sending.current = true;
    void sendPage(binderId, batchId, next.number, next.photos).then(
      ({ status, left: after }) => {
        sending.current = false;
        if (after !== undefined) setLeft(after);
        if (status.kind === "failed" && status.reason === "daily-pages") setLeft(0);
        setQueue((current) =>
          current.map((page) =>
            page.id === next.id
              ? /* Sent, the photos have done their work. */
                { ...page, status, photos: status.kind === "sent" ? null : page.photos }
              : page,
          ),
        );
      },
    );
  }, [queue, binderId, batchId]);

  /* Done, once nothing is still on its way. */
  const pending = queue.filter((page) => page.status.kind === "waiting").length;
  const closed = useRef(false);
  useEffect(() => {
    if (!finishing || pending > 0 || closed.current) return;
    closed.current = true;
    onDone();
  }, [finishing, pending, onDone]);

  const picture = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    made.current.add(url);
    return url;
  };
  const release = (page: ShotPage) => {
    if (!page.thumb) return;
    URL.revokeObjectURL(page.thumb);
    made.current.delete(page.thumb);
  };

  const shoot = async (file: File) => {
    const replacing = retaking.current;
    retaking.current = null;
    let id: number;
    if (replacing !== null) {
      id = replacing;
      const old = queue.find((page) => page.id === id);
      if (!old) return;
      release(old);
      setQueue((current) =>
        current.map((page) => (page.id === id ? blank(id, old.number) : page)),
      );
    } else {
      if (!canTake) return;
      id = nextId.current;
      nextId.current += 1;
      const number = nextPage;
      setQueue((current) => [...current, blank(id, number)]);
    }

    let cut: Pick<ShotPage, "thumb" | "photos"> | null = null;
    let status: Status | null = null;
    try {
      const pieces = await cutPage(file);
      if (pieces) {
        cut = {
          thumb: pieces.thumb ? picture(pieces.thumb) : null,
          photos: { page: pieces.page, cells: pieces.cells },
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

  /* Every page keeps the number it was taken as, so the next one
     follows the last, even past a refused page that was removed. */
  const last = queue[queue.length - 1];
  const nextPage = last ? last.number + 1 : startPage;
  /* A page not yet answered for counts against the day already. A
     retake from the check replaces a page and costs nothing. */
  const leftNow =
    left === undefined || left === null ? left : Math.max(0, left - pending);
  const outOfPages = !retake && leftNow === 0;
  /* A page to take only while the queue and the binder have room for
     it and the day has pages left; a retake is the one page it replaces. */
  const canTake =
    !finishing &&
    !outOfPages &&
    (retake ? queue.length === 0 : queue.length < MAX_SCAN_PAGES) &&
    nextPage <= BINDER_PAGES;
  const anySent = queue.some((page) => page.status.kind === "sent");
  const stepping = !retake && queue.length === 0;

  /* Only a page the server turned down can go: one that went is in the
     queue on the server, and is thrown away from the check. */
  const remove = (page: ShotPage) => {
    release(page);
    setQueue((current) => current.filter((each) => each.id !== page.id));
  };

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

      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong px-4 py-6 text-center">
        {/* The first page moves only before anything is shot: a page
            sent is that page on the server. */}
        <div className="flex items-center gap-3">
          {stepping && (
            <StepButton
              label={START_EARLIER}
              disabled={startPage <= 1}
              onClick={() => setStartPage((page) => Math.max(1, page - 1))}
            >
              <Minus className="size-4" aria-hidden="true" />
            </StepButton>
          )}
          <p
            aria-live="polite"
            className="text-sm font-semibold text-text-primary tabular-nums"
          >
            {startingAtLine(queue[0]?.number ?? startPage)}
          </p>
          {stepping && (
            <StepButton
              label={START_LATER}
              disabled={startPage >= BINDER_PAGES}
              onClick={() => setStartPage((page) => Math.min(BINDER_PAGES, page + 1))}
            >
              <Plus className="size-4" aria-hidden="true" />
            </StepButton>
          )}
        </div>
        <p className="max-w-xs text-sm text-text-secondary">{PAGES_HINT}</p>
        {outOfPages ? (
          <p role="status" className="max-w-xs text-sm text-text-primary">
            {SCAN_REFUSALS["daily-pages"]}
          </p>
        ) : (
          canTake && (
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
          )
        )}
        {!retake && typeof leftNow === "number" && !outOfPages && (
          <p className="text-xs text-text-muted tabular-nums">
            {pagesLeftLine(leftNow)}
          </p>
        )}
      </div>

      {queue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queue.map((page) => (
            <QueueRow
              key={page.id}
              page={page}
              canChange={!finishing}
              onRetake={() => {
                retaking.current = page.id;
                input.current?.click();
              }}
              onRemove={() => remove(page)}
            />
          ))}
        </ul>
      )}

      {anySent && (
        <p role="status" className="text-center text-sm text-text-secondary">
          {READING_IN_BACKGROUND}
        </p>
      )}

      {anySent && (
        <Dock>
          <Button
            type="button"
            className="w-full"
            disabled={finishing}
            onClick={() => setFinishing(true)}
          >
            {finishing && <Spinner size="sm" />}
            {DONE_SCANNING}
          </Button>
        </Dock>
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

/**
 * A shot page: its picture, its number, how its send is going, and
 * Retake and Remove when it was refused.
 */
function QueueRow({
  page,
  canChange,
  onRetake,
  onRemove,
}: {
  page: ShotPage;
  canChange: boolean;
  onRetake: () => void;
  onRemove: () => void;
}) {
  const { status } = page;
  const line =
    status.kind === "failed"
      ? sendRefusalLine(status.reason)
      : status.kind === "sent"
        ? PAGE_SENT
        : SENDING_PAGE;
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
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <span className="font-semibold text-text-primary tabular-nums">
          Page {page.number}
        </span>
        <p
          role={status.kind === "failed" ? "alert" : undefined}
          className={
            status.kind === "failed" ? "text-text-primary" : "text-text-secondary"
          }
        >
          {status.kind === "waiting" && page.thumb && (
            <Spinner size="sm" className="mr-1.5 inline-block align-[-2px]" />
          )}
          {line}
        </p>
      </div>
      {status.kind === "failed" && canChange && (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onRetake}>
            {RETAKE}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {REMOVE_PAGE}
          </Button>
        </>
      )}
    </li>
  );
}
