import { z } from "zod";

import { tooMany } from "@/lib/api/throttle";
import { storeHere } from "@/lib/events/store-days";
import { clientKey } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * "You're here": the store a phone is standing in, from the app as it
 * opens. The position is compared with the stores' pins once and never
 * written anywhere; the answer is the store's counter code, the same
 * door its QR code is. Throttled, so nobody walks a grid to map pins.
 */

const coordinate = z.coerce.number().finite();

export async function GET(request: Request): Promise<Response> {
  const limited = tooMany(`store-here:${await clientKey()}`, 30, 10 * 60 * 1000);
  if (limited) return limited;

  const url = new URL(request.url);
  const lat = coordinate.min(-90).max(90).safeParse(url.searchParams.get("lat"));
  const lng = coordinate.min(-180).max(180).safeParse(url.searchParams.get("lng"));
  if (!lat.success || !lng.success) {
    return Response.json({ error: "bad-position" }, { status: 400 });
  }

  const store = await storeHere(lat.data, lng.data);
  return Response.json({ store });
}
