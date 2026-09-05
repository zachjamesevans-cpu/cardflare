import type { NextConfig } from "next";

/**
 * Headers every response carries.
 *
 * The site sent none before launch. These are the ones with no
 * trade-off: they stop a browser sniffing a response into a script,
 * stop the site being framed by someone else's page, keep the full
 * URL out of the Referer sent to card-art hosts, and tell browsers
 * this origin never uses the camera or microphone from a web page.
 * Geolocation stays available to the site itself for Local, off today.
 *
 * No Content-Security-Policy yet: Next's inline scripts, Rive's WASM
 * and the card-art hosts each need an allowance, and a wrong one
 * breaks pages silently. That is a deliberate round of its own, after
 * launch, with a report-only pass first. Strict-Transport-Security is
 * set by the host in front of us for the custom domain.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  images: {
    /**
     * Hosts whose card artwork may be optimised and served.
     *
     * An explicit allow-list, never a wildcard: `remotePatterns` is what stops
     * Next's image optimiser being used as an open proxy for arbitrary URLs.
     * Kept in step with ALLOWED_IMAGE_HOSTS in src/lib/cards/images.ts, which
     * re-checks the same thing before rendering.
     *
     * Listing a host permits nothing on its own. Artwork also needs the
     * provider to have supplied the URL, and NEXT_PUBLIC_ENABLE_CARD_IMAGES to
     * be true.
     */
    remotePatterns: [
      { protocol: "https", hostname: "optcgapi.com" },
      { protocol: "https", hostname: "www.optcgapi.com" },
      { protocol: "https", hostname: "cards.scryfall.io" },
      { protocol: "https", hostname: "assets.tcgdex.net" },
      {
        protocol: "https",
        hostname: "legendstory-production-s3-public.s3.amazonaws.com",
      },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "cmsassets.rgpub.io" },
      { protocol: "https", hostname: "cards.lorcast.io" },
    ],
  },
};

export default nextConfig;
