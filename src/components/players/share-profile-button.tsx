"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Share profile, the Instagram button.
 *
 * On a phone it opens the system share sheet with the profile's
 * address; anywhere without one it copies the address and says so,
 * because a button that copies silently gets pressed four times.
 */
export function ShareProfileButton({
  url,
  title,
  className,
  label = "Share profile",
}: {
  /** Absolute, or a path from the site root, resolved when pressed. */
  url: string;
  title: string;
  className?: string;
  /** What the button is called: a hunt shares the same way. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const share = async () => {
    const href = url.startsWith("/") ? `${window.location.origin}${url}` : url;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title, url: href });
        return;
      }
    } catch {
      /* The sheet was dismissed, or refused. Fall through to copying. */
    }
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard refused: nothing more to offer here. */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      title={copied ? "Link copied" : label}
      aria-label={copied ? "Link copied" : label}
      className={cn(
        "flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/80 text-text-secondary backdrop-blur transition-colors hover:border-border-strong hover:text-text-primary",
        className,
      )}
    >
      {copied ? (
        <Check className="size-5 text-accent" aria-hidden="true" />
      ) : (
        <Share2 className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
