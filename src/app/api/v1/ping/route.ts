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
  // Echo the header-transport payload too, so the connection test can
  // prove middleboxes pass `x-cf-payload` through intact — that header
  // is how the app's writes travel on networks that eat request bodies.
  const header = request.headers.get("x-cf-payload") ?? "";
  return Response.json({
    ok: true,
    method: "POST",
    bytes: body.length,
    headerBytes: header.length,
    at: new Date().toISOString(),
  });
}

export async function DELETE(): Promise<Response> {
  return Response.json({ ok: true, method: "DELETE", at: new Date().toISOString() });
}
