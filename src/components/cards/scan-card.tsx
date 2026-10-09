"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";
import { scanCardAction } from "@/lib/cards/scan-actions";
import {
  ADD_TO_BINDER,
  IS_THIS_IT,
  OTHER_MATCHES,
  READING_CARD,
  SCAN_AGAIN,
  SCAN_CARD,
  SCAN_HINT,
  SCAN_LONG_EDGE,
  SCAN_MAX_BYTES,
  SCAN_NEXT,
  SCAN_REFUSALS,
  SCAN_WITH_PRO,
  TAKE_PHOTO,
  scanReadLine,
  type ScanRead,
  type ScanRefusal,
} from "@/lib/cards/scan-rules";
import {
  cardArt,
  printingLabel,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * The card scanner, in the binder's Add cards sheet.
 *
 * The founder (2026-10-09): card scanning as a Pro feature, "to cover
 * the cost", tried by admins first. One photo of one card goes to a
 * model that reads what is printed on it; our catalogue finds the card;
 * the player says yes before anything moves. In this order, the same
 * as the app's scan screen:
 *
 * 1. The hint and "Take photo", a file input that on a phone opens the
 *    camera and on a laptop a file picker. Nothing opens on its own.
 * 2. The photo shrunk here, in the browser, to SCAN_LONG_EDGE on its
 *    long side, then sent; "Reading the card..." while it is read.
 * 3. "Is this it?": the best guess large, its printing already chosen
 *    when the set code said which, the other guesses in a row under
 *    it. "Add to binder" puts it in the sheet's tray, the same tray the
 *    search fills, so a run of scans is one press of the sheet's Add;
 *    "Scan the next card" goes back to step 1, and is the way past a
 *    guess that is wrong.
 * 4. A refusal in its own words, and "Try again". A card read but not
 *    found also hands its name to the search, to find it by hand.
 *
 * Every word is from scan-rules.ts, which the app mirrors.
 */

type Outcome = Awaited<ReturnType<typeof scanCardAction>>;
type Match = Extract<Outcome, { ok: true }>["matches"][number];

type Step =
  | { kind: "ready" }
  | { kind: "reading" }
  | {
      kind: "found";
      read: ScanRead;
      matches: Match[];
      /** Which guess is up top. */
      at: number;
      /** Null is any printing. */
      printingId: string | null;
      /** In the tray; a new printing or guess is a new add. */
      added: boolean;
    }
  | { kind: "refused"; reason: ScanRefusal };

/** The size a photo is drawn at: SCAN_LONG_EDGE on the long side, never larger. */
export function scanSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(1, SCAN_LONG_EDGE / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** JPEG qualities to try, best first, until the photo fits SCAN_MAX_BYTES. */
const QUALITIES = [0.85, 0.7, 0.55] as const;

/**
 * The photo, upright and shrunk, as a JPEG under SCAN_MAX_BYTES; null
 * when it will not fit. A phone's photo is twelve megapixels and the
 * card's text reads as well at a thousand pixels, so the big one never
 * leaves the device. An <img> rather than createImageBitmap because
 * every browser now turns an <img> the way the camera was held, and
 * draws it to a canvas that way too. Throws when the browser cannot
 * open the file.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = scanSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, size.width, size.height);
    return await fitJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A drawn canvas as a JPEG under SCAN_MAX_BYTES, stepping the quality
 * down until it fits; null when it never does. The page scanner cuts
 * each pocket through this too.
 */
export async function fitJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, "image/jpeg", quality),
    );
    if (blob && blob.size <= SCAN_MAX_BYTES) return blob;
  }
  return null;
}

export function ScanCard({
  imagesEnabled,
  onAdd,
  onNotFound,
}: {
  imagesEnabled: boolean;
  /** Into the tray: one copy, or one more of a line already there. */
  onAdd: (card: CardResult, printing?: CardPrinting) => void;
  /** What was read off a card the catalogue does not have, for the search. */
  onNotFound: (name: string) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const input = useRef<HTMLInputElement>(null);

  const scan = async (file: File) => {
    setStep({ kind: "reading" });
    let photo: Blob | null;
    try {
      photo = await shrinkPhoto(file);
    } catch {
      /* Not a picture this browser can open: nothing in it to read. */
      setStep({ kind: "refused", reason: "no-card" });
      return;
    }
    if (!photo) {
      setStep({ kind: "refused", reason: "too-big" });
      return;
    }

    const form = new FormData();
    form.append("photo", photo, "card.jpg");
    let outcome: Outcome;
    try {
      outcome = await scanCardAction(form);
    } catch {
      setStep({ kind: "refused", reason: "unavailable" });
      return;
    }

    const top = outcome.ok ? outcome.matches[0] : undefined;
    if (!outcome.ok || !top) {
      const reason = outcome.ok ? "not-found" : outcome.reason;
      if (reason === "not-found" && outcome.read) {
        const name = outcome.read.englishName || outcome.read.name;
        if (name) onNotFound(name);
      }
      setStep({ kind: "refused", reason });
      return;
    }
    setStep({
      kind: "found",
      read: outcome.read,
      matches: outcome.matches,
      at: 0,
      printingId: top.printingId,
      added: false,
    });
  };

  const again = () => setStep({ kind: "ready" });

  return (
    <section aria-label={SCAN_CARD} className="flex flex-col gap-4">
      {/* Opened by the button alone: a tap is the only way the camera opens. */}
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
          if (file) void scan(file);
        }}
      />

      {step.kind === "ready" && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-border-strong px-4 py-8 text-center">
          <ScanLine className="size-8 text-accent" aria-hidden="true" />
          <p className="max-w-xs text-sm text-text-secondary">{SCAN_HINT}</p>
          <Button type="button" onClick={() => input.current?.click()}>
            <Camera className="size-4" aria-hidden="true" />
            {TAKE_PHOTO}
          </Button>
        </div>
      )}

      {step.kind === "reading" && (
        <div
          role="status"
          className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-border px-4 py-10"
        >
          <Spinner size="lg" />
          <p className="text-sm text-text-secondary">{READING_CARD}</p>
        </div>
      )}

      {step.kind === "refused" && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-border px-4 py-8 text-center">
          <p role="alert" className="max-w-xs text-sm text-text-primary">
            {SCAN_REFUSALS[step.reason]}
          </p>
          <Button type="button" variant="secondary" onClick={again}>
            {SCAN_AGAIN}
          </Button>
        </div>
      )}

      {step.kind === "found" && (
        <Found
          step={step}
          imagesEnabled={imagesEnabled}
          onPick={(at) =>
            setStep({
              ...step,
              at,
              printingId: step.matches[at]?.printingId ?? null,
              added: false,
            })
          }
          onPrinting={(printingId) => setStep({ ...step, printingId, added: false })}
          onAdd={() => {
            const match = step.matches[step.at];
            if (!match) return;
            const printing = match.card.printings.find(
              (each) => each.id === step.printingId,
            );
            onAdd(match.card, printing);
            setStep({ ...step, added: true });
          }}
          onAgain={again}
        />
      )}
    </section>
  );
}

function Found({
  step,
  imagesEnabled,
  onPick,
  onPrinting,
  onAdd,
  onAgain,
}: {
  step: Extract<Step, { kind: "found" }>;
  imagesEnabled: boolean;
  onPick: (at: number) => void;
  onPrinting: (printingId: string | null) => void;
  onAdd: () => void;
  onAgain: () => void;
}) {
  const match = step.matches[step.at];
  if (!match) return null;
  const { card } = match;
  const line = scanReadLine(step.read);
  const others = step.matches
    .map((each, at) => ({ each, at }))
    .filter(({ at }) => at !== step.at);

  return (
    <div className="flex flex-col gap-4">
      {/* What the model read, small, so a misread is plain to see. */}
      {line && <p className="text-xs text-text-muted">{line}</p>}

      <h3 className="text-base font-semibold text-text-primary">{IS_THIS_IT}</h3>

      <ScannedCard
        card={card}
        printingId={step.printingId}
        imagesEnabled={imagesEnabled}
      />

      {/* The versions, as the picker names them: the one the set code
          pointed at already chosen, tapped again for any printing. */}
      <PrintingChips card={card} printingId={step.printingId} onPrinting={onPrinting} />

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">{OTHER_MATCHES}</p>
          <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            {others.map(({ each, at }) => (
              <li key={each.card.id} className="shrink-0">
                <OtherMatch
                  card={each.card}
                  imagesEnabled={imagesEnabled}
                  onPick={() => onPick(at)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Added, the next card is the one button left; before, it is
          the way past a guess that is wrong. */}
      {!step.added && (
        <Button type="button" className="w-full" onClick={onAdd}>
          {ADD_TO_BINDER}
        </Button>
      )}
      <Button
        type="button"
        variant={step.added ? "primary" : "secondary"}
        className="w-full"
        onClick={onAgain}
      >
        {SCAN_NEXT}
      </Button>
    </div>
  );
}

/**
 * The guess, large: the chosen printing's art (or the card's own when
 * any printing will do), its name and its number. The page scanner's
 * pockets show their card the same way.
 */
export function ScannedCard({
  card,
  printingId,
  imagesEnabled,
  className = "w-44",
}: {
  card: CardResult;
  printingId: string | null;
  imagesEnabled: boolean;
  /** The art's width; the height follows the card. */
  className?: string;
}) {
  const chosen = card.printings.find((each) => each.id === printingId) ?? null;
  const art = cardArt(chosen?.imageUrl, card.printings, card.exactName);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className={cn(
          "aspect-[63/88] overflow-hidden rounded-[6px] bg-black ring-2 ring-black/80",
          className,
        )}
      >
        {imagesEnabled && isRenderableImageUrl(art) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={art}
            alt={cardImageAlt(card.exactName, card.canonicalCardNumber)}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-elevated px-2 text-center text-xs font-semibold text-text-primary">
            {card.exactName}
          </span>
        )}
      </div>
      <span className="mt-1 text-lg font-semibold text-text-primary">
        {card.exactName}
      </span>
      <span className="font-mono text-sm text-text-muted">
        {card.canonicalCardNumber}
      </span>
    </div>
  );
}

/**
 * A card's printings as chips, the chosen one lit; tapped again, it lets
 * go, for any printing. Nothing when the card has one printing. The page
 * scanner's pockets use the same chips.
 */
export function PrintingChips({
  card,
  printingId,
  onPrinting,
}: {
  card: CardResult;
  /** Null is any printing. */
  printingId: string | null;
  onPrinting: (printingId: string | null) => void;
}) {
  if (card.printings.length <= 1) return null;
  return (
    <div role="group" aria-label="Printing" className="flex flex-wrap gap-2">
      {card.printings.map((printing) => {
        const on = printing.id === printingId;
        return (
          <button
            key={printing.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPrinting(on ? null : printing.id)}
            className={cn(
              "cursor-pointer rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-semibold transition-colors",
              on
                ? "border-accent bg-accent/15 text-text-primary"
                : "border-border bg-surface text-text-secondary hover:text-text-primary",
            )}
          >
            {printingLabel(printing, card.exactName) ?? "Standard printing"}
          </button>
        );
      })}
    </div>
  );
}

/** One of the other guesses: a small tile that swaps in as the top one. */
export function OtherMatch({
  card,
  imagesEnabled,
  onPick,
}: {
  card: CardResult;
  imagesEnabled: boolean;
  onPick: () => void;
}) {
  const art = cardArt(null, card.printings, card.exactName);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${card.exactName}, ${card.canonicalCardNumber}`}
      className="flex w-[60px] cursor-pointer flex-col gap-1 text-left"
    >
      <span className="block h-[84px] w-[60px] overflow-hidden rounded-[5px] border border-border bg-elevated">
        {imagesEnabled && isRenderableImageUrl(art) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={art} alt="" className="size-full object-cover" />
        ) : (
          <span className="line-clamp-4 px-0.5 text-[8px] font-semibold text-text-secondary">
            {card.exactName}
          </span>
        )}
      </span>
      <span className="truncate font-mono text-[10px] text-text-muted">
        {card.canonicalCardNumber}
      </span>
    </button>
  );
}

/**
 * The scanner's door for a player who is not Pro, while the scanner is
 * open to Pro: the Pro page, where it is bought. Drawn only for
 * "pro-door"; a player the trial does not include sees nothing at all.
 */
export function ScanWithPro() {
  return (
    <Link
      href="/pro"
      className="inline-flex w-fit items-center gap-1.5 py-1 text-sm font-semibold text-accent hover:text-accent-hover"
    >
      <ScanLine className="size-4" aria-hidden="true" />
      {SCAN_WITH_PRO}
    </Link>
  );
}
