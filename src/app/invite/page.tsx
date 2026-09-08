import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { RequestInviteSection } from "@/components/marketing/request-invite-section";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request an invite",
  description:
    "Ultra for game stores and Max for show vendors are set up personally. Tell us who you are and we will be in touch.",
  alternates: { canonical: `${siteUrl()}/invite` },
};

/**
 * Where a store or vendor asks to be set up.
 *
 * This form lived at the foot of the homepage until the homepage was
 * shortened to a final call to action. The Max page still sends
 * vendors here, and the fragment on the link preselects their type
 * exactly as it did on the homepage.
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
