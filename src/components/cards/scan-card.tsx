"use client";

import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";
import { scanCardAction } from "@/lib/cards/scan-actions";
import { SCAN_LONG_EDGE, SCAN_MAX_BYTES } from "@/lib/cards/scan-rules";
import { cardArt, printingLabel, type CardResult } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * The single scan's parts: the photo shrunk and read, and the pieces a
 * scanned card is shown with. The scanner (`Scanner`) sends every photo
 * through `readPhoto` first; the card viewer (`CardViewer`) and the
 * page check draw a guess with `ScannedCard`, its printings with
 * `PrintingChips` and the other guesses with `OtherMatch`.
 *
 * The founder (2026-10-09): card scanning "to cover the cost", one free
 * scan after another up to ten a day, and Pro without a limit. One
 * photo of one card goes to a model that reads what is printed on it;
 * our catalogue finds the card; the player says yes before anything
 * moves.
 */

export type ScanAnswer = Awaited<ReturnType<typeof scanCardAction>>;

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
export const QUALITIES = [0.85, 0.7, 0.55] as const;

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

/**
 * One photo, read: shrunk here, in the browser, to SCAN_LONG_EDGE on its
 * long side, then sent, and the server's answer. The photo itself is
 * the caller's to keep until the answer comes: a whole page is cut from
 * it at full size.
 */
export async function readPhoto(file: Blob): Promise<ScanAnswer> {
  let photo: Blob | null;
  try {
    photo = await shrinkPhoto(file);
  } catch {
    /* Not a picture this browser can open: nothing in it to read. */
    return { ok: false, reason: "no-card" };
  }
  if (!photo) return { ok: false, reason: "too-big" };

  const form = new FormData();
  form.append("photo", photo, "card.jpg");
  let outcome: ScanAnswer;
  try {
    outcome = await scanCardAction(form);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  /* Read, but nothing in our catalogue answers to it. */
  if (outcome.ok && outcome.matches.length === 0) {
    return { ok: false, reason: "not-found", read: outcome.read };
  }
  return outcome;
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
  chosen,
  named = false,
  imagesEnabled,
  onPick,
}: {
  card: CardResult;
  /** Lit as the pocket's card now: "Might be one of these" keeps showing after a tap. */
  chosen?: boolean;
  /** Its name over its number, for a card the reader did not name itself. */
  named?: boolean;
  imagesEnabled: boolean;
  onPick: () => void;
}) {
  const art = cardArt(null, card.printings, card.exactName);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${card.exactName}, ${card.canonicalCardNumber}`}
      aria-pressed={chosen}
      className="flex w-[60px] cursor-pointer flex-col gap-1 text-left"
    >
      <span
        className={cn(
          "block h-[84px] w-[60px] overflow-hidden rounded-[5px] border bg-elevated",
          chosen ? "border-accent" : "border-border",
        )}
      >
        {imagesEnabled && isRenderableImageUrl(art) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={art} alt="" className="size-full object-cover" />
        ) : (
          <span className="line-clamp-4 px-0.5 text-[8px] font-semibold text-text-secondary">
            {card.exactName}
          </span>
        )}
      </span>
      {named && (
        <span className="truncate text-[11px] font-semibold text-text-primary">
          {card.exactName}
        </span>
      )}
      <span className="truncate font-mono text-[10px] text-text-muted">
        {card.canonicalCardNumber}
      </span>
    </button>
  );
}
