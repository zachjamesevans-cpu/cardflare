import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared shell for the legal drafts.
 *
 * The draft notice is part of the layout rather than each page so it cannot be
 * dropped by accident — these documents have not been reviewed by a lawyer and
 * must not present themselves as if they have.
 */
export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <>
      <SiteHeader />

      <main id="main" className="flex-1 px-5 py-16 sm:px-6 md:py-20">
        <article className="mx-auto w-full max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {title}
          </h1>

          <p className="mt-3 text-sm text-text-muted">Last updated {lastUpdated}</p>

          <p
            role="note"
            className="mt-8 rounded-[var(--radius-card)] border border-warning/30 bg-warning/10 px-5 py-4 text-sm leading-relaxed text-text-secondary"
          >
            <strong className="font-semibold text-warning">Draft document.</strong> This
            is a plain-language draft written for CardFlare&rsquo;s pre-launch waitlist.
            It has not been reviewed by a lawyer and is not legal advice. It will be
            replaced with a reviewed version before CardFlare launches commercially.
          </p>

          <div className="mt-10 flex flex-col gap-8 leading-relaxed text-text-secondary [&_a]:text-accent [&_a]:underline [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text-primary [&_li]:ml-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
            {children}
          </div>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}

/** Heading + body grouping used by both legal drafts. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
