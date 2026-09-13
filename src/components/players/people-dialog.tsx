"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A profile number that opens its list: followers, following.
 *
 * The founder: "these followers / following should have a separate
 * pop up. It's redundant to have a whole section at the bottom of the
 * page." So the tile is the button and the list is a dialog over the
 * page, the way Instagram does it. The list itself is rendered by the
 * server and handed in as children; this only opens and closes.
 */
export function PeopleDialog({
  value,
  label,
  title,
  className,
  children,
}: {
  value: number;
  label: string;
  /** The dialog's heading: "Followers", "Following". */
  title: string;
  /** The tile's classes, shared with the tiles that do not open. */
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    dialog.current?.close();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  /* A tap on a name inside navigates away; the dialog closes with it
     so the page behind is not left with a modal open on return. */
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a")) close();
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-haspopup="dialog"
      >
        <span className="text-lg font-bold text-text-primary tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-xs text-text-secondary">{label}</span>
      </button>

      <dialog
        ref={dialog}
        aria-label={title}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,24rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex max-h-[88dvh] flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5 text-text-primary">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">
              {title}{" "}
              <span className="font-normal text-text-muted tabular-nums">
                · {value.toLocaleString()}
              </span>
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-m-1 shrink-0 rounded-full p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {open && children}
        </div>
      </dialog>
    </>
  );
}
