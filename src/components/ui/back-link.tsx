import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The way back: a chevron and nothing else.
 *
 * The founder (round 16): back buttons are a plain chevron, no text.
 * "Back to your profile" said where the arrow went in words the page
 * above it already said, and the app's header back is the chevron
 * alone, so the website's is too. The words are kept for a screen
 * reader as "Back", the same label the app's chevron carries.
 *
 * Players' pages only. The store console and the admin console keep
 * their own named links, which go between consoles rather than back.
 */
export function BackLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      className={cn(
        "-ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary",
        className,
      )}
    >
      <ChevronLeft className="size-6" aria-hidden="true" />
    </Link>
  );
}
