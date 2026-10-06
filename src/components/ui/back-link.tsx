import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { HEADER_BACK, HEADER_ICON } from "@/components/ui/header-button";
import { cn } from "@/lib/cn";

/**
 * The way back: a chevron and nothing else.
 *
 * The founder (round 16): back buttons are a plain chevron, no text.
 * "Back to your profile" said where the arrow went in words the page
 * above it already said, and the app's header back is the chevron
 * alone, so the website's is too. The words are kept for a screen
 * reader as "Back", the same label the app's chevron carries, and it
 * is drawn the same way: the accent chevron in the header's 44px box,
 * no circle, at the page's edge like every other header icon.
 *
 * Players' pages only. The store console and the admin console keep
 * their own named links, which go between consoles rather than back.
 */
export function BackLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link href={href} aria-label="Back" className={cn(HEADER_BACK, className)}>
      <ChevronLeft className={HEADER_ICON} aria-hidden="true" />
    </Link>
  );
}
