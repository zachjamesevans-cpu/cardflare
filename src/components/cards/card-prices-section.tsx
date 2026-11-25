import { cardPrices } from "@/lib/cards/prices";

import { CardPricesPanel } from "./card-prices";

/** The card page's prices, fetched on the server and streamed in. */
export async function CardPricesSection({ cardId }: { cardId: string }) {
  return <CardPricesPanel prices={await cardPrices(cardId)} />;
}
