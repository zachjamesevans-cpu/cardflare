"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A sheet: the native `<dialog>`, opened modally, with a title, a
 * scrolling body and a footer that stays put.
 *
 * The same element the card zoom and the people list are built on, so
 * it brings the focus trap, Escape and the inert page with it. The
 * footer is where a sheet's one action lives, and it sits inside the
 * dialog rather than at the page's edge, so the floating tab bar can
 * never cover it: the top layer is above everything.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer = null,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className={cn(
        "m-auto max-h-[92dvh] w-[min(96vw,28rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="flex max-h-[88dvh] flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface text-text-primary shadow-[var(--shadow-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="min-w-0 truncate font-semibold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 shrink-0 cursor-pointer rounded-full p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{open && children}</div>
        {footer && (
          <div className="border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
