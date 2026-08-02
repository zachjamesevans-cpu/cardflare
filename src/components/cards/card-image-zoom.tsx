"use client";

import { useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { CardThumbnail } from "./card-thumbnail";
import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";

/**
 * A thumbnail you can open at a readable size.
 *
 * Tap or click, not hover. Hover does not exist on the phones this is built
 * for, and on a desktop a hover-opened panel over a scrolling list fires by
 * accident every time somebody's pointer crosses a row. Hover earns its keep
 * on the affordance instead — the cursor and the ring say "this opens".
 *
 * Built on the native `<dialog>`, which brings the focus trap, Escape, inert
 * background and `::backdrop` with it. Re-implementing those in a project
 * whose lists otherwise ship no JavaScript would be a lot of code to get
 * subtly wrong.
 *
 * Not used inside the card search: those thumbnails live inside the result
 * button, and a button inside a button is invalid.
 */
export function CardImageZoom({
  imageUrl,
  exactName,
  cardNumber,
  enabled,
  anyPrinting = false,
  caption,
}: {
  imageUrl: string | null;
  exactName: string;
  cardNumber: string;
  enabled: boolean;
  anyPrinting?: boolean;
  /** The printing, so the large view says which version is being shown. */
  caption?: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  const thumbnail = (
    <CardThumbnail
      imageUrl={imageUrl}
      exactName={exactName}
      cardNumber={cardNumber}
      enabled={enabled}
      anyPrinting={anyPrinting}
    />
  );

  /*
   * Nothing to open, so nothing to press. Rendering a button over the
   * placeholder would promise a bigger picture that does not exist.
   */
  if (!enabled || !isRenderableImageUrl(imageUrl)) return thumbnail;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`View ${exactName} larger`}
        className="shrink-0 cursor-zoom-in rounded-[7px] transition-shadow hover:ring-2 hover:ring-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {thumbnail}
      </button>

      <dialog
        ref={dialog}
        aria-label={cardImageAlt(exactName, cardNumber)}
        /*
         * Clicking the backdrop closes. The dialog element itself fills the
         * whole viewport when modal, so a click landing on it rather than on
         * the panel inside is a click on the backdrop.
         */
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,26rem)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-text-primary backdrop:bg-black/75"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold">{exactName}</p>
              <p className="font-mono text-xs text-text-muted">
                {cardNumber}
                {caption && <span className="font-sans"> · {caption}</span>}
              </p>
            </div>

            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="-m-1 shrink-0 rounded-full p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/*
           * Sized to the card's own proportions so the panel does not jump
           * when the image arrives. `sizes` matches the width above, so the
           * optimiser is not asked for a desktop-sized image on a phone.
           */}
          <div className="relative aspect-[60/84] w-full overflow-hidden rounded-[8px] bg-elevated">
            <Image
              src={imageUrl}
              alt={cardImageAlt(exactName, cardNumber)}
              fill
              sizes="(max-width: 448px) 92vw, 416px"
              className="object-contain"
            />
          </div>
        </div>
      </dialog>
    </>
  );
}
