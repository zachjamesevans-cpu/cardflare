/**
 * How a write's payload reaches `/api/v1` — by body, or by header.
 *
 * Field-found fact, not paranoia: on some networks (the founder's, for
 * one) every request the app sends *with a body* dies in transit while
 * bodyless requests sail through — the connection-test matrix proved it
 * six ways (GET 200, POST-empty 200, POST-with-body timeout under every
 * content-type, DELETE-empty 200). Safari on the same phone is fine, so
 * it is the native networking path plus that network, and no amount of
 * server code fixes a request that never arrives.
 *
 * So the app is allowed to send its JSON in the `x-cf-payload` header
 * instead — URI-encoded, which keeps every byte ASCII and header-safe.
 * The header wins when present; otherwise the body is read as before,
 * so curl, tests, and any ordinary client keep working unchanged. The
 * payloads are tiny by construction (a display name, a card id, a note
 * capped at 120 characters) — nowhere near any header size limit.
 */
export async function readJsonPayload(request: Request): Promise<unknown> {
  const header = request.headers.get("x-cf-payload");

  if (header !== null) {
    try {
      return JSON.parse(decodeURIComponent(header));
    } catch {
      return null;
    }
  }

  return request.json().catch(() => null);
}
