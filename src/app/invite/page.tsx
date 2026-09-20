import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { RequestInviteSection } from "@/components/marketing/request-invite-section";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request an invite",
  description:
    "Max for card show vendors is set up personally. Tell us who you are and which shows you work, and we will be in touch.",
  alternates: { canonical: `${siteUrl()}/invite` },
};

/**
 * Where a card show vendor asks to be set up on Max.
 *
 * This form lived at the foot of the homepage until the homepage was
 * shortened to a final call to action. The Max page sends vendors here,
 * and the fragment on the link preselects their type exactly as it did
 * on the homepage. Stores do not come here: Ultra is self-serve.
 */
export default function InvitePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <RequestInviteSection />
      </main>
      <SiteFooter />
    </>
  );
}
