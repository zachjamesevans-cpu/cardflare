import { readJsonPayload } from "@/lib/api/payload";
import { readClaim, validateClaim } from "@/lib/stores/claim-schema";
import { submitClaim } from "@/lib/stores/claims";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { clientKey } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * A shop owner asking for their listing, from the app.
 *
 * NO AUTH, deliberately, and the same reasoning as the website's form:
 * the person behind the counter at an unclaimed shop has no cardflare
 * account, and making them create one before they can say "this is
 * mine" is a wall in front of the exact door this opens.
 *
 * Which is why nothing here is trusted. The store id comes from the
 * path, every field is validated by the same `validateClaim` the
 * website uses, and the only thing written is a row in a queue an admin
 * reads. Nothing a claimant sends can publish, verify, or hand over
 * anything.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;

  const limited = tooMany(
    `claim:${await clientKey()}`,
    LIMITS.claim.limit,
    LIMITS.claim.windowMs,
  );
  if (limited) return limited;

  /* Header first: the app sends no body at all. See lib/api/payload.ts. */
  const body = (await readJsonPayload(request)) as Record<string, unknown> | null;

  const fields = readClaim({
    get: (name: string) => (body ?? {})[name],
  });

  const errors = validateClaim(fields);

  if (Object.keys(errors).length > 0) {
    /* The first message rather than the whole map: a phone draws one
       error line, and the field-by-field version is the website's. */
    return Response.json({ error: Object.values(errors)[0] }, { status: 400 });
  }

  const result = await submitClaim(storeId, fields);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
