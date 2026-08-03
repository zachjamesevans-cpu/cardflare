"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { NAV_LINKS, WAITLIST_ANCHOR } from "@/lib/site";

/**
 * Mobile navigation disclosure.
 *
 * Uses a plain disclosure rather than a modal dialog: the panel is in the
 * document flow directly after the trigger, so tab order is already correct and
 * no focus trap is needed. Escape closes it and focus returns to the trigger.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-border bg-canvas px-5 pb-6 shadow-[var(--shadow-panel)]"
      >
        <nav aria-label="Main" className="flex flex-col gap-1 pt-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-control)] px-3 py-3.5 text-base font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:bg-elevated hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}

          {/* Named for its audience, same as the desktop nav: a player must
              never conclude they need an account. */}
          <a
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-[var(--radius-control)] px-3 py-3.5 text-base font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:bg-elevated hover:text-text-primary"
          >
            Store sign-in
          </a>

          <a
            href={WAITLIST_ANCHOR}
            onClick={() => setOpen(false)}
            className={`${buttonStyles("primary", "lg")} mt-3 w-full`}
          >
            Join the Waitlist
          </a>
        </nav>
      </div>
    </div>
  );
}
