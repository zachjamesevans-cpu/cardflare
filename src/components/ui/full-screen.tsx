"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A screen of its own over everything: the native `<dialog>`, opened
 * modally, the whole viewport, for the scanner and the card viewer.
 *
 * The same element the Sheet is built on, so it brings the focus trap,
 * Escape and the inert page with it, and it opens on top of a sheet
 * that is already open: each modal dialog goes to the top layer above
 * the last. Mounted means open; the caller draws it or does not.
 */
export function FullScreen({
  label,
  onClose,
  onKeyDown,
  children,
  className,
}: {
  /** What a screen reader hears it called. */
  label: string;
  /** The X and Escape. */
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-canvas p-0 text-text-primary",
        "backdrop:bg-black/40",
        "motion-safe:animate-[cf-sheet-in_var(--duration-base)_var(--ease-out-soft)]",
        className,
      )}
    >
      <div className="relative flex h-full flex-col overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 shrink-0 cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
