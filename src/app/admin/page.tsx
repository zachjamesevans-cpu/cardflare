import type { Metadata } from "next";
import { Store as StoreIcon } from "lucide-react";

import { ConfigStatus } from "@/components/admin/config-status";
import { InviteStoreForm } from "@/components/admin/invite-store-form";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { listStores } from "@/lib/stores/repository";
import type { StoreListing } from "@/lib/stores/repository";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin data must never be cached or prerendered — it is per-request and
 * privileged. `requireAdmin` reads cookies, which already forces dynamic
 * rendering, but saying so here makes the intent explicit.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const stores = await listStores();

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-5" aria-labelledby="config-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="config-heading" className="text-xl font-bold text-text-primary">
            Configuration
          </h2>
          <p className="text-sm text-text-secondary">
            What this deployment can see. Changing a variable requires a redeploy before
            it shows up here.
          </p>
        </div>

        <ConfigStatus />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="invite-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="invite-heading" className="text-xl font-bold text-text-primary">
            Invite a store
          </h2>
          <p className="text-sm text-text-secondary">
            Adds the store to the beta and emails the contact a sign-in link.
          </p>
        </div>

        <Card>
          <InviteStoreForm />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="stores-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="stores-heading" className="text-xl font-bold text-text-primary">
            Stores
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {stores.length} total
          </span>
        </div>

        {stores.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <StoreIcon className="size-6 text-text-muted" aria-hidden="true" />
            <p className="text-text-secondary">
              No stores yet. Invite the first one above.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {stores.map((store) => (
              <StoreRow key={store.id} store={store} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StoreRow({ store }: { store: StoreListing }) {
  const location = [store.city, store.region].filter(Boolean).join(", ");

  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-text-primary">{store.name}</p>
        <p className="truncate text-sm text-text-muted">
          {store.contact_email}
          {location && ` · ${location}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {store.invitePending ? (
          <Badge tone="neutral">Invite pending</Badge>
        ) : (
          <Badge>
            {store.memberCount} {store.memberCount === 1 ? "member" : "members"}
          </Badge>
        )}
        <Badge tone="neutral">{store.status}</Badge>
      </div>
    </Card>
  );
}
