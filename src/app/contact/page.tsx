import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Questions about ${SITE.name}? Send a message and we will reply.`,
  alternates: { canonical: `${siteUrl()}/contact` },
};

/**
 * The contact page.
 *
 * Marketing chrome (header and footer) rather than the app shell: the
 * people who write in are stores deciding whether to sign up, vendors
 * asking about shows, and players with a problem — everyone arrives
 * from the public site, not from inside a room.
 *
 * The address is printed under the form on purpose. A contact form that
 * offers no alternative is a dead end the moment anything is wrong with
 * it, and somebody who wants to attach a spreadsheet needs an inbox,
 * not a textarea.
 */
export default function ContactPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col gap-3 pb-8">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              Contact us
            </h1>
            <p className="text-lg text-text-secondary">
              A store wanting to run CardFlare at your locals, a vendor headed to a
              show, or something that went wrong. It all reaches the same place, and a
              person reads it.
            </p>
          </div>

          <ContactForm />

          <p className="pt-6 text-sm text-text-muted">
            Prefer your own mail app? Write to{" "}
            <a
              href={`mailto:${SITE.contactInbox}`}
              className="text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              {SITE.contactInbox}
            </a>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
