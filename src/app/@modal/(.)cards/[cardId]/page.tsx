import { notFound } from "next/navigation";
import { countCardOpen } from "@/lib/cards/game-hub";
import { after } from "next/server";
import { Suspense } from "react";

import { CardModal } from "@/components/cards/card-modal";
import { CardPageView } from "@/components/cards/card-page";
import { CardPricesSkeleton } from "@/components/cards/card-prices";
import { CardPricesSection } from "@/components/cards/card-prices-section";
import { getViewer } from "@/lib/auth/session";
import { cardPage } from "@/lib/cards/card-page";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";

export const dynamic = "force-dynamic";

/**
 * A card clicked inside the site opens over the page it was clicked on
 * (card-modal.tsx): this intercepts /cards/[cardId] on a client-side
 * navigation. The same card page as src/app/cards/[cardId]/page.tsx,
 * which still answers a typed URL, a refresh or a shared link.
 */
export default async function CardOverPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const viewer = await getViewer();
  const viewerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const page = await cardPage(cardId, viewerId);
  if (!page) notFound();
  /* One more look, for the game hubs' "most searched" (game-hub.ts). */
  after(() => countCardOpen(page.card.cardId));

  return (
    <CardModal cardId={page.card.cardId}>
      <CardPageView
        page={page}
        viewerId={viewerId}
        imagesEnabled={cardImagesEnabled()}
        prices={
          <Suspense fallback={<CardPricesSkeleton />}>
            <CardPricesSection cardId={page.card.cardId} />
          </Suspense>
        }
      />
    </CardModal>
  );
}
