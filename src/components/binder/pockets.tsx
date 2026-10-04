"use client";

import type { DragEvent, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { isRenderableImageUrl } from "@/lib/cards/images";
import { cn } from "@/lib/cn";

/**
 * The pockets a page is made of: what a binder and a hunt share.
 *
 * A hunt is drawn like a binder (the founder: "Do you think the Hunts
 * feature should just be binders instead of lists? So it's all kinda
 * the same language."), so the pocket, the "+" pocket, the empty
 * pocket, the arrows and the dots live here once, and binder-page.tsx
 * and hunt-binder.tsx both import them. The geometry is the binder's
 * and does not vary: three by three, the card's 63:88 face, the black
 * sleeve with its lip. The app's pockets.tsx is the same split.
 */

/* Three across, three down: the one page a binder has. */
export const COLUMNS = 3;
export const POCKETS_PER_PAGE = COLUMNS * COLUMNS;

/* A pocket: black, with the sleeve's lip catching the light at the top. */
export const POCKET =
  "relative aspect-[63/88] w-full overflow-hidden rounded-[5px] bg-black ring-2 ring-black/80 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.06)]";

/** What a pocket needs to know about the card in it. */
export interface PocketCard {
  name: string;
  number: string;
  imageUrl: string | null;
  /** Copies, when more than one is in the pocket: the binder's "x2". */
  quantity?: number;
  /** The binder's "ON YOUR HUNT" band, for a visitor hunting this card. */
  onYourHunt?: boolean;
}

export function PocketTile({
  card,
  imagesEnabled,
  dim = false,
  children,
}: {
  card: PocketCard;
  imagesEnabled: boolean;
  /** Faded: a hunt's card with every copy found. */
  dim?: boolean;
  /** Anything else drawn over the art: a hunt's check or count chip. */
  children?: ReactNode;
}) {
  const art = imagesEnabled && isRenderableImageUrl(card.imageUrl);

  return (
    <div className={POCKET}>
      {/* The art alone fades when dimmed, so a badge over it stays crisp. */}
      <div className={cn("size-full", dim && "opacity-50")}>
        {art ? (
          /* The picture is not its own drag source: the pocket is, so
             the whole tile travels, not the image out of it. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={card.imageUrl ?? ""}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-0.5 bg-elevated px-1 text-center">
            <span className="line-clamp-2 text-[10px] font-semibold text-text-primary">
              {card.name}
            </span>
            <span className="text-[9px] text-text-muted">{card.number}</span>
          </span>
        )}
      </div>
      {/* The sleeve lip. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[6%] bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]"
      />
      {card.quantity !== undefined && card.quantity > 1 && (
        <span className="absolute top-1 left-1 rounded-full bg-canvas/85 px-1.5 py-px text-[9px] font-bold text-text-primary tabular-nums ring-1 ring-border-strong">
          ×{card.quantity}
        </span>
      )}
      {card.onYourHunt && (
        <span className="absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center text-[8px] font-bold tracking-wider text-accent-contrast uppercase">
          ON YOUR HUNT
        </span>
      )}
      {children}
    </div>
  );
}

/** A visitor's empty pocket: black, and nothing to press. */
export function EmptyPocket() {
  return <div aria-hidden="true" className={POCKET} />;
}

const ADD_POCKET =
  "flex aspect-[63/88] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[5px] border-2 border-dashed border-border-strong bg-black/60 text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none";

/**
 * The owner's empty pocket: a "+" that opens Add cards. The founder:
 * "there should be a + on the open card areas in the binder to add a
 * card that way." A binder opens its sheet (`onClick`); a hunt goes
 * to the composer with itself chosen (`href`).
 */
export function AddPocket({ onClick, href }: { onClick?: () => void; href?: string }) {
  const inside = (
    <>
      <span aria-hidden="true" className="text-3xl leading-none font-light">
        +
      </span>
      <span className="text-[10px] font-semibold">Add</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label="Add a card" className={ADD_POCKET}>
        {inside}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add a card"
      className={ADD_POCKET}
    >
      {inside}
    </button>
  );
}

/** The arrow over the page's middle: previous on the left, next on the right. */
export function PageArrow({
  side,
  disabled,
  onClick,
  ring = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  side: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  /** Lit as a drop target, while a binder's card is in the air. */
  ring?: boolean;
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent) => void;
}) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "prev" ? "Previous page" : "Next page"}
      disabled={disabled}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "absolute top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-canvas/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-30",
        side === "prev" ? "left-1" : "right-1",
        ring && "ring-2 ring-accent",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/** The dots under the page: one per page, the current one long and lime. */
export function PageDots({
  pages,
  page,
  onPick,
}: {
  pages: number;
  page: number;
  onPick: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: pages }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Page ${index + 1}`}
          aria-current={index === page ? "page" : undefined}
          onClick={() => onPick(index)}
          className={cn(
            "h-1.5 cursor-pointer rounded-full transition-all",
            index === page ? "w-4 bg-accent" : "w-1.5 bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}
