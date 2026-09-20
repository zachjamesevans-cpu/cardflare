import "server-only";

import QRCode from "qrcode";

/**
 * A QR for any URL of ours, drawn the way the counter code is.
 *
 * The wizard shows each screen's TV link as a code so the person at
 * the television can scan it from the console on their phone instead
 * of typing a token. Same options as `joinQrSvg` in
 * `src/lib/events/qr.ts`: SVG so it scales, level Q so it survives a
 * smudge, black on white so it scans whatever the theme.
 */
export async function qrSvgFor(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
