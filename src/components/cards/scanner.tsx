"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Camera, Minus, Plus, ScanLine } from "lucide-react";

import {
  CardViewer,
  type Choice,
  type ViewerItem,
} from "@/components/cards/card-viewer";
import { cutPage, sendPage, sendRefusalLine } from "@/components/cards/page-scan";
import { readPhoto } from "@/components/cards/scan-card";
import { ProMark } from "@/components/stores/ultra-mark";
import { ProWords } from "@/components/stores/pro-words";
import { Button, buttonStyles } from "@/components/ui/button";
import { FullScreen } from "@/components/ui/full-screen";
import { Spinner } from "@/components/ui/spinner";
import type { ScanRights } from "@/lib/cards/scan";
import { scanRightsAction } from "@/lib/cards/scan-actions";
import {
  BINDER_PAGES,
  DONE_SCANNING,
  FILL_THE_FRAME,
  GET_PRO,
  PAGES_ARE_PRO,
  READING_CARD,
  SCAN_AGAIN,
  SCAN_INTRO_PAGES,
  SCAN_INTRO_SINGLE,
  SCAN_REFUSALS,
  SCAN_TITLE,
  SENDING_PAGE,
  START_EARLIER,
  START_LATER,
  TAKE_PHOTO,
  firstEmptyPage,
  freeScansLeftLine,
  pageAddedLine,
  pagesLeftLine,
  startingAtLine,
  takePageLabel,
} from "@/lib/cards/scan-rules";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * The scanner: one camera for one card or a whole binder page, over
 * everything. The founder (2026-10-09): "a unified scan - it can detect
 * if it's scanning a full page and says you need pro for that", and on
 * the screen "Scan a single, or scan a page in your binder for Pro". In
 * this order, the same as the app's scanner:
 *
 * 1. "Scan a card.", "Scan a whole binder page with PRO", the hint, and
 *    the free scans left today when there is a limit. "Take photo", a
 *    file input that on a phone opens the camera; nothing opens on its
 *    own.
 * 2. Every photo goes first through the single scan (`readPhoto`),
 *    shrunk to SCAN_LONG_EDGE; the photo itself is kept at full size
 *    until the answer comes. "Reading the card..." meanwhile.
 *    - A card: the card viewer on it. That's it puts it in the sheet's
 *      tray, the tray the search fills, and the camera is back.
 *    - "is-page", for somebody who scans pages: the kept photo is cut
 *      into the page and its nine pockets and sent to be read in the
 *      background (`sendPage`), every page of this scanner in one queue.
 *      The first lands on the binder's first empty page; after it, a
 *      "Page 5" chip says where the next one goes, and steps it. "Page 4
 *      added..." shows for a moment, and the camera stays.
 *    - "is-page" for anybody else, or "daily-singles": the Pro screen,
 *      the reason, PRO large, Get Pro and Try again.
 *    - Anything else: the refusal in its own words and Try again. A card
 *      read but not found hands its name to the sheet's search.
 * 3. Done closes the scanner once the pages still on their way have
 *    landed, back to the sheet and its tray.
 *
 * A retake from the check opens here for that page of that queue: the
 * photo is that page, so it is sent as one without the single read.
 * Every word is from scan-rules.ts, which the app mirrors.
 */

type Step =
  | { kind: "camera" }
  | { kind: "reading" }
  | { kind: "found"; item: ViewerItem }
  | { kind: "pro"; why: string }
  | { kind: "refused"; line: string };

/** How long "Page 4 added..." stays up. */
export const TOAST_MS = 4000;

export function Scanner({
  binderId,
  rights,
  pockets,
  left: leftAtOpen,
  retake = null,
  imagesEnabled,
  playerGames,
  onAdd,
  onNotFound,
  onDone,
}: {
  binderId: string;
  /** What this player may scan, read with the page. */
  rights: ScanRights;
  /** The pockets this binder already has a card in. */
  pockets: readonly number[];
  /** Pages left today: null has no limit, undefined is not known yet. */
  left?: number | null;
  /** A page of a queue already out, shot again: that queue, that page. */
  retake?: { batchId: string; page: number } | null;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** Into the tray: one copy, or one more of a line already there. */
  onAdd: (card: CardResult, printing?: CardPrinting) => void;
  /** What was read off a card the catalogue does not have, for the search. */
  onNotFound: (name: string) => void;
  /** Closed, every page sent; whether any page went. */
  onDone: (sentPages: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "camera" });
  /* One queue, one id, made once: every page this scanner sends joins it. */
  const [batchId] = useState(() => retake?.batchId ?? crypto.randomUUID());
  const [nextPage, setNextPage] = useState(
    () => retake?.page ?? firstEmptyPage(pockets),
  );
  const [sent, setSent] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [left, setLeft] = useState(leftAtOpen);
  const [singlesLeft, setSinglesLeft] = useState(rights.singlesLeft);
  const [toast, setToast] = useState<{ line: string; alert: boolean } | null>(null);
  const [stepping, setStepping] = useState(false);
  /* Done was pressed: the scanner closes once the sends still out land. */
  const [finishing, setFinishing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /* The photo at full size, until its answer comes. */
  const kept = useRef<Blob | null>(null);
  /* Pages go one after another, in the order they were shot. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  /* The viewer's pictures of the photos, let go when they close. */
  const made = useRef(new Set<string>());

  useEffect(() => {
    const urls = made.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  const release = () => {
    for (const url of made.current) URL.revokeObjectURL(url);
    made.current.clear();
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* Done, once nothing is still on its way. */
  const closed = useRef(false);
  useEffect(() => {
    if (!finishing || inFlight > 0 || closed.current) return;
    closed.current = true;
    onDone(sent > 0);
  }, [finishing, inFlight, sent, onDone]);

  const anyPage = sent + inFlight > 0;
  /* A page not yet answered for counts against the day already. */
  const leftNow = typeof left === "number" ? Math.max(0, left - inFlight) : left;
  /* A retake is the one page it replaces. */
  const canShoot = !finishing && !(retake && anyPage);

  /**
   * The kept photo as a page: cut here, then sent behind whatever page
   * is still going. The camera is back at once.
   */
  const sendAsPage = async (file: Blob) => {
    if (leftNow === 0) {
      setStep({ kind: "refused", line: SCAN_REFUSALS["daily-pages"] });
      return;
    }
    const number = nextPage;
    setStep({ kind: "reading" });
    let photos: { page: Blob; cells: Blob[] } | null;
    try {
      photos = await cutPage(file);
    } catch {
      photos = null;
    }
    if (!photos) {
      setStep({ kind: "refused", line: SCAN_REFUSALS["too-big"] });
      return;
    }
    const cut = photos;
    setNextPage(Math.min(BINDER_PAGES, number + 1));
    setInFlight((count) => count + 1);
    setStep({ kind: "camera" });
    chain.current = chain.current.then(async () => {
      const outcome = await sendPage(binderId, batchId, number, cut);
      setInFlight((count) => count - 1);
      if (outcome.ok) {
        setSent((count) => count + 1);
        setLeft(outcome.left);
        setToast({ line: pageAddedLine(number), alert: false });
        return;
      }
      if (outcome.reason === "daily-pages") setLeft(0);
      /* Not sent: the next page is this one again. */
      setNextPage((page) => (page === number + 1 ? number : page));
      setToast({ line: sendRefusalLine(outcome.reason), alert: true });
    });
  };

  const shoot = async (file: Blob) => {
    setToast(null);
    if (retake) {
      await sendAsPage(file);
      return;
    }
    /* The day's free scans are gone: the Pro screen, nothing sent. */
    if (rights.singles === "used-up" || singlesLeft === 0) {
      setStep({ kind: "pro", why: SCAN_REFUSALS["daily-singles"] });
      return;
    }
    kept.current = file;
    setStep({ kind: "reading" });
    const answer = await readPhoto(file);
    const photo = kept.current;
    kept.current = null;
    /* The server counts free scans; its count is the one shown. */
    if (singlesLeft !== null) {
      scanRightsAction()
        .then((now) => setSinglesLeft(now.singlesLeft))
        .catch(() => {});
    }

    const top = answer.ok ? answer.matches[0] : undefined;
    if (answer.ok && top) {
      release();
      const picture = photo ? URL.createObjectURL(photo) : null;
      if (picture) made.current.add(picture);
      setStep({
        kind: "found",
        item: {
          key: "scan",
          place: null,
          photo: picture,
          choice: { card: top.card, printingId: top.printingId },
          matches: answer.matches,
          state: "found",
          sure: answer.sure,
          note: answer.note,
          lookFor: answer.read.englishName || answer.read.name,
        },
      });
      return;
    }
    const reason = answer.ok ? "not-found" : answer.reason;
    if (reason === "is-page") {
      if (rights.pages === "on" && photo) await sendAsPage(photo);
      else setStep({ kind: "pro", why: PAGES_ARE_PRO });
      return;
    }
    if (reason === "daily-singles") {
      setSinglesLeft(0);
      setStep({ kind: "pro", why: SCAN_REFUSALS["daily-singles"] });
      return;
    }
    if (reason === "not-found" && !answer.ok && answer.read) {
      const name = answer.read.englishName || answer.read.name;
      if (name) onNotFound(name);
    }
    setStep({ kind: "refused", line: SCAN_REFUSALS[reason] });
  };

  const again = () => {
    release();
    setStep({ kind: "camera" });
  };

  return (
    <FullScreen label={SCAN_TITLE} onClose={() => setFinishing(true)}>
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
        }}
      />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 pt-10 text-center">
        {step.kind === "pro" ? (
          <ProScreen why={step.why} onAgain={again} />
        ) : step.kind === "refused" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p role="alert" className="max-w-xs text-base text-text-primary">
              {step.line}
            </p>
            <Button type="button" variant="secondary" onClick={again}>
              {SCAN_AGAIN}
            </Button>
          </div>
        ) : step.kind === "reading" ? (
          <div
            role="status"
            className="flex flex-1 flex-col items-center justify-center gap-3"
          >
            <Spinner size="lg" />
            <p className="text-sm text-text-secondary">{READING_CARD}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-text-primary">
                {SCAN_INTRO_SINGLE}
              </h2>
              <p className="text-base text-text-secondary">
                {SCAN_INTRO_PAGES} <ProMark />
              </p>
            </div>
            <p className="max-w-xs text-sm text-text-muted">{FILL_THE_FRAME}</p>
            {singlesLeft !== null && (
              <p className="text-xs text-text-muted tabular-nums">
                {freeScansLeftLine(singlesLeft)}
              </p>
            )}

            {/* One soft outline in a card's shape, which is a nine-pocket
                page's shape too, with the shutter in it. */}
            <div className="flex aspect-[5/7] w-full max-w-60 flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border-2 border-dashed border-border-strong">
              <ScanLine className="size-10 text-accent" aria-hidden="true" />
              {canShoot && (
                <Button type="button" size="lg" onClick={() => input.current?.click()}>
                  <Camera className="size-5" aria-hidden="true" />
                  {retake ? takePageLabel(retake.page) : TAKE_PHOTO}
                </Button>
              )}
            </div>

            {/* Where the next page goes, once a page has gone. */}
            {anyPage && !retake && (
              <PageChip
                page={nextPage}
                open={stepping}
                onToggle={() => setStepping(!stepping)}
                onStep={(by) =>
                  setNextPage((page) => Math.min(BINDER_PAGES, Math.max(1, page + by)))
                }
              />
            )}
            {inFlight > 0 && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-text-secondary"
              >
                <Spinner size="sm" />
                {SENDING_PAGE}
              </p>
            )}
            {!retake && sent > 0 && typeof leftNow === "number" && (
              <p className="text-xs text-text-muted tabular-nums">
                {pagesLeftLine(leftNow)}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mx-auto mt-6 w-full max-w-md">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={finishing}
          onClick={() => setFinishing(true)}
        >
          {finishing && <Spinner size="sm" />}
          {DONE_SCANNING}
        </Button>
      </div>

      {toast && (
        <p
          role={toast.alert ? "alert" : "status"}
          className="fixed inset-x-4 bottom-24 mx-auto max-w-sm rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-3 text-center text-sm text-text-primary shadow-[var(--shadow-panel)]"
        >
          {toast.line}
        </p>
      )}

      {step.kind === "found" && (
        <CardViewer
          label={SCAN_TITLE}
          items={[step.item]}
          at={0}
          onAt={() => {}}
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          onChoose={(choice: Choice) =>
            setStep({ kind: "found", item: { ...step.item, choice } })
          }
          onConfirm={() => {
            const { choice } = step.item;
            if (choice) {
              onAdd(
                choice.card,
                choice.card.printings.find((each) => each.id === choice.printingId),
              );
            }
            again();
          }}
          onClose={again}
        />
      )}
    </FullScreen>
  );
}

/**
 * Pages are Pro, or the day's free scans are gone: why, PRO large, the
 * way to it, and the camera again.
 */
function ProScreen({ why, onAgain }: { why: string; onAgain: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <p className="max-w-xs text-base text-text-primary">
        <ProWords text={why} />
      </p>
      <ProMark className="text-6xl" />
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Link href="/pro" className={buttonStyles("primary", "lg")}>
          {GET_PRO}
        </Link>
        <Button type="button" variant="secondary" onClick={onAgain}>
          {SCAN_AGAIN}
        </Button>
      </div>
    </div>
  );
}

/** "Page 5", where the next page goes; tapped, the stepper. */
function PageChip({
  page,
  open,
  onToggle,
  onStep,
}: {
  page: number;
  open: boolean;
  onToggle: () => void;
  onStep: (by: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="cursor-pointer rounded-full border border-border bg-elevated px-3 py-1 text-xs font-semibold text-text-primary tabular-nums transition-colors hover:border-border-strong"
      >
        Page {page}
      </button>
      {open && (
        <div className="flex items-center gap-3">
          <StepButton
            label={START_EARLIER}
            disabled={page <= 1}
            onClick={() => onStep(-1)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </StepButton>
          <p
            aria-live="polite"
            className="text-sm font-semibold text-text-primary tabular-nums"
          >
            {startingAtLine(page)}
          </p>
          <StepButton
            label={START_LATER}
            disabled={page >= BINDER_PAGES}
            onClick={() => onStep(1)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </StepButton>
        </div>
      )}
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
