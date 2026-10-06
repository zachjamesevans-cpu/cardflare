import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NewPasswordForm } from "@/components/auth/new-password-form";
import { AppShell } from "@/components/layout/app-shell";
import { BackLink } from "@/components/ui/back-link";
import { getViewer } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Password",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where both password paths land: changing one you know, and choosing the
 * first one after following a reset link.
 *
 * The reset link arrives through `/auth/callback`, which exchanges the code
 * for a real session before redirecting here — so by the time this renders,
 * the visitor is signed in and the ordinary guard is all the protection it
 * needs. There is no separate token for this page to validate, which is one
 * fewer secret to get wrong.
 */
export default async function PasswordPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile/password");

  return (
    <AppShell
      area="Profile"
      email={viewer.user.email ?? ""}
      title="Password"
      description="Set a password so you can sign in without waiting for an email."
    >
      <div className="flex max-w-md flex-col gap-5">
        <BackLink href="/profile/settings" />
        <NewPasswordForm signedInAs={viewer.user.email ?? ""} />
      </div>
    </AppShell>
  );
}
