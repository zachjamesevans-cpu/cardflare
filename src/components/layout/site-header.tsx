import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { NAV_LINKS, SITE, WAITLIST_ANCHOR } from "@/lib/site";
import { MobileNav } from "./mobile-nav";

/**
 * Sticky site header. Server-rendered; only the mobile disclosure is a client
 * component, so the nav costs almost no JavaScript on desktop.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link
          href="/"
          className="rounded-[var(--radius-control)]"
          aria-label={`${SITE.name} home`}
        >
          <Logo priority />
        </Link>

        {/*
         * Five links plus the CTA no longer fit at md without the labels
         * wrapping inside their tabs, so the full nav waits for lg and the
         * disclosure menu covers tablets.
         */}
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
          {/*
           * `Store sign-in`, not `Sign in`. Players have no account and must
           * never think they need one — naming the audience keeps a curious
           * player from concluding cardflare wants them to register. Quiet on
           * purpose: it shares a row with the waitlist CTA, which is the thing
           * the landing page is actually for.
           */}
          <Link
            href="/contact"
            className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
          >
            Contact
          </Link>
          <Link
            href="/login"
            className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
          >
            Store sign-in
          </Link>
          <ButtonLink href={WAITLIST_ANCHOR} size="sm" className="ml-3">
            Join the Waitlist
          </ButtonLink>
        </nav>

        <MobileNav />
      </div>
    </header>
  );
}
