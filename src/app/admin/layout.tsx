import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { areasForUser } from "@/lib/auth/areas";
import { claimPendingInvite, requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The page guards itself as well. Duplicated on purpose: a layout is not a
  // security boundary on its own, and a future page added here would otherwise
  // inherit the appearance of protection without the substance.
  const user = await requireAdmin();

  /*
   * The founder tests operator features by inviting themselves. Ordinarily
   * an invite is claimed at the next sign-in — but the admin is already
   * signed in, so it is claimed here instead, and the switcher below picks
   * the new membership up on this same render.
   */
  await claimPendingInvite(user);

  const areas = await areasForUser(user.id, true);

  return (
    <AppShell
      area="Admin"
      email={user.email ?? ""}
      title="CardFlare admin"
      description="Manage the stores taking part in the beta."
      areas={areas}
      currentArea="/admin"
    >
      {children}
    </AppShell>
  );
}
