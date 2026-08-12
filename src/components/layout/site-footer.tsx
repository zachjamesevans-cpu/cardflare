import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

/*
 * The store sign-in lives in the header now — the founder moved it there so
 * an owner opening the site on a phone is not scrolling past the whole
 * landing page to get in. It is not repeated here: two links to the same
 * place in one viewport reads as a mistake.
 */
const FOOTER_LINKS = [
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <Logo size={32} />
          <p className="text-sm text-text-muted">{SITE.domain}</p>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-6 gap-y-3"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[var(--radius-control)] text-sm text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6">
          <p className="text-xs leading-relaxed text-text-muted">
            &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved. One
            Piece Card Game and all other trading card game names, logos and card images
            are trademarks of their respective owners. {SITE.name} is not affiliated
            with, endorsed by, or sponsored by any trading card game publisher.
          </p>
        </div>
      </div>
    </footer>
  );
}
