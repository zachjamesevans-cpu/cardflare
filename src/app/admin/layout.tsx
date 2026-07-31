import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The page guards itself as well. Duplicated on purpose: a layout is not a
  // security boundary on its own, and a future page added here would otherwise
  // inherit the appearance of protection without the substance.
  const user = await requireAdmin();

  return (
    <AppShell
      area="Admin"
      email={user.email ?? ""}
      title="CardFlare admin"
      description="Manage the stores taking part in the beta."
    >
      {children}
    </AppShell>
  );
}
