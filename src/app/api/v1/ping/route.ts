export const dynamic = "force-dynamic";

/**
 * The diagnostic the app's connection test taps: no auth, no database,
 * no body parsing beyond an echo — if POSTing *this* times out from a
 * client, the problem is transport, not CardFlare's logic.
 */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, method: "GET", at: new Date().toISOString() });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text().catch(() => "");
  return Response.json({
    ok: true,
    method: "POST",
    bytes: body.length,
    at: new Date().toISOString(),
  });
}
