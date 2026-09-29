"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The three dots, and the list behind them.
 *
 * A post's extras go here, the way every social app keeps them: the
 * founder, looking at a post wearing "Update progress", "2 copies still
 * needed" and "View all 2" under its cards, "Basically just trying to
 * make it all look concise and only visible when you need it." So the
 * card shows what it is, and the things you can DO to it wait behind
 * one glyph in the corner.
 *
 * Plain markup on purpose: a button with `aria-expanded`, a list with
 * `role="menu"`, Escape and an outside click to close, arrows to move.
 * Nothing renders when there is nothing to offer, so a post with no
 * extras has no dots.
 */

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function DotsMenu({
  items,
  label = "More",
  className,
}: {
  items: MenuItem[];
  /** The button's accessible name: "More about this post". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const move = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? buttons[(at + 1) % buttons.length]
        : buttons[(at - 1 + buttons.length) % buttons.length];
    next?.focus();
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="-m-1 flex size-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={id}
          role="menu"
          onKeyDown={move}
          className="absolute top-full right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface py-1 shadow-[var(--shadow-panel)]"
        >
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-text-primary hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              >
                {item.icon && (
                  <span
                    className="text-text-secondary [&>svg]:size-4"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
