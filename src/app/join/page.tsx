import { permanentRedirect } from "next/navigation";

/**
 * The code form moved to the Room tab.
 *
 * Kept as a redirect rather than deleted, because this path is printed
 * beside the QR code on every poster a store has ever put up, and a
 * poster cannot be edited after it is taped to a counter. A player who
 * types it lands on the same form, one tab over.
 */
export default function JoinRedirect(): never {
  permanentRedirect("/room");
}
