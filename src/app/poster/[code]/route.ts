import { NextResponse } from "next/server";

import { formatEventWindow } from "@/lib/events/format";
import { classifyCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  findEventByJoinCode,
  findShowByJoinCode,
  findStoreByJoinCode,
} from "@/lib/events/repository";
import { posterPdf, type PosterInput } from "@/lib/events/poster-pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/** Enough for a store re-printing a sheet, nowhere near enough to farm. */
const POSTER_MAX = 20;
const POSTER_WINDOW_MS = 5 * 60 * 1000;

/**
 * The poster as a downloadable one-page PDF.
 *
 * This exists because phones cannot print the HTML sheet cleanly: iOS
 * Safari adds its own URL, date and page count and paginates however it
 * likes. A PDF prints identically everywhere.
 *
 * Public like `/e/[code]` and by the same reasoning: everything on the
 * poster is what the poster is *for* — it hangs on a counter. Resolving is
 * by exact code only (no enumeration beyond what `/e/` already allows) and
 * rate limited per network.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normalizeJoinCode(decodeURIComponent(raw));
  const kind = classifyCode(code);
  if (!kind) return new NextResponse("Not found", { status: 404 });

  const rate = checkRateLimit(
    `poster:${await clientKey()}`,
    POSTER_MAX,
    POSTER_WINDOW_MS,
  );
  if (!rate.allowed) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  let input: PosterInput | null = null;

  if (kind === "event") {
    const event = await findEventByJoinCode(code);
    if (event?.endsAt) {
      input = {
        title: event.name,
        subtitle: formatEventWindow(event.startsAt, event.endsAt, event.storeTimeZone),
        kind: "event",
        joinCode: code,
      };
    }
  } else if (kind === "store") {
    const store = await findStoreByJoinCode(code);
    if (store) {
      input = { title: store.name, kind: "counter", joinCode: code };
    }
  } else {
    const show = await findShowByJoinCode(code);
    if (show) {
      input = {
        title: show.name,
        subtitle: formatEventWindow(show.startsAt, show.endsAt, show.timeZone),
        kind: "show",
        joinCode: code,
      };
    }
  }

  if (!input) return new NextResponse("Not found", { status: 404 });

  const bytes = await posterPdf(input);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cardflare-${code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
