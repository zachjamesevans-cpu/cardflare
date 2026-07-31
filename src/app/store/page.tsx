import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store");
  if (viewer.kind === "admin") redirect("/admin");

  if (viewer.kind === "unaffiliated") {
    return (
      <AppShell
        area="Store"
        email={viewer.user.email ?? ""}
        title="No store yet"
        description="This account is signed in but is not linked to a store."
      >
        <Card className="text-text-secondary">
          If you were invited, make sure you signed in with the same email address the
          invitation was sent to. Otherwise, get in touch and we will sort it out.
        </Card>
      </AppShell>
    );
  }

  // Reads through the user's own session, so Row Level Security decides what
  // comes back — a store can only ever see its own row.
  const supabase = await createSupabaseServerClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, city, region, status")
    .order("name");

  const store = stores?.[0];

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={store?.name ?? "Your store"}
      description="Your CardFlare beta home."
    >
      <Card className="flex flex-col items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
          <CalendarClock className="size-5 text-accent" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-text-primary">
          Event Rooms are coming next
        </h2>
        <p className="max-w-xl text-text-secondary">
          You&rsquo;re set up and signed in. The next release adds Event Rooms:
          you&rsquo;ll create a room for an event, print its QR code, and players will
          join by scanning it. Until then we&rsquo;ll set your first event up with you
          directly.
        </p>
      </Card>
    </AppShell>
  );
}
