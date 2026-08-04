import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Store as StoreIcon } from "lucide-react";

import { InviteStoreForm } from "@/components/admin/invite-store-form";
import { StoreDirectory } from "@/components/admin/store-directory";
import type { DirectoryStore } from "@/components/admin/store-directory";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { listLiveRooms } from "@/lib/events/rooms";
import { countOpenFlares } from "@/lib/lists/repository";
import { listStores } from "@/lib/stores/repository";

export const metadata: Metadata = {
  title: "Stores",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every operator on the platform: invite one, or click into one. */
export default async function AdminStoresPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const [stores, liveRooms] = await Promise.all([listStores(), listLiveRooms()]);
  const flareCounts = await countOpenFlares(liveRooms.map((room) => room.eventId));

  /*
   * Everything the directory rows show, resolved here so the client gets
   * plain serialisable props. The walk-in switch applies here too: the live
   * summary is read-only and does not know it, and a walk-in room at a
   * store that turned walk-ins off is the one the scan path would close.
   */
  const liveByStore = new Map(liveRooms.map((room) => [room.storeId, room] as const));
  const directory: DirectoryStore[] = stores.map((store) => {
    const room = liveByStore.get(store.id);
    const live = room && (room.kind === "scheduled" || store.walk_in_enabled);

    return {
      id: store.id,
      name: store.name,
      contact_email: store.contact_email,
      city: store.city,
      region: store.region,
      status: store.status,
      kind: store.kind,
      memberCount: store.memberCount,
      invitePending: store.invitePending,
      liveRoomName: live ? room.name : null,
      flares: live ? (flareCounts.get(room.eventId) ?? 0) : null,
    };
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Stores & vendors</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          Every operator on the platform. Click one for its code, its room and its
          inventory; a live badge means people are trading there right now.
        </p>
      </div>

      {/* Finding an operator is what this page is for, so it comes first;
          inviting a new one is the occasional job and lives below. */}
      <section className="flex flex-col gap-5" aria-labelledby="stores-heading">
        <h3 id="stores-heading" className="text-lg font-bold text-text-primary">
          All operators
        </h3>

        {stores.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <StoreIcon className="size-6 text-text-muted" aria-hidden="true" />
            <p className="text-text-secondary">
              No stores yet. Invite the first one below.
            </p>
          </Card>
        ) : (
          <StoreDirectory stores={directory} />
        )}
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="invite-heading">
        <div className="flex flex-col gap-1.5">
          <h3 id="invite-heading" className="text-lg font-bold text-text-primary">
            Invite a store
          </h3>
          <p className="text-sm text-text-secondary">
            Adds the store to the beta and emails the contact a sign-in link.
          </p>
        </div>

        <Card>
          <InviteStoreForm />
        </Card>
      </section>
    </div>
  );
}
