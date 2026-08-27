import "server-only";

import QRCode from "qrcode";

import { siteUrl } from "@/lib/site";

/**
 * The URL a QR code points at.
 *
 * Short on purpose: fewer characters means a lower QR version, which means
 * larger modules at the same printed size, which means it scans from further
 * away and in worse light. `/e/CODE` rather than `/events/join?code=CODE` is
 * the difference between a code that works across a counter and one that does
 * not.
 */
export function joinUrl(code: string, game?: string | null): string {
  /*
   * The game rides the URL, not a second printed code. A television
   * running one tournament shows this with `?g=one-piece`, and the room
   * scoped its card search before the player typed a letter — while the
   * counter's own code stays universal. A few extra characters raise
   * the QR one version; on a screen shown at television size that costs
   * nothing, and the printed counter sheet never carries a game.
   */
  return `${siteUrl()}/e/${code}${game ? `?g=${encodeURIComponent(game)}` : ""}`;
}

/**
 * Renders the join URL as an inline SVG.
 *
 * SVG rather than a raster: this gets printed, and a bitmap scaled up to A5 is
 * exactly how you get a code that will not scan. Returned as markup so the
 * page stays a Server Component with no image request.
 *
 * Error correction level Q tolerates roughly 25% damage, which is the right
 * trade for something taped to a counter and handled all evening.
 */
export async function joinQrSvg(code: string, game?: string | null): Promise<string> {
  return QRCode.toString(joinUrl(code, game), {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
