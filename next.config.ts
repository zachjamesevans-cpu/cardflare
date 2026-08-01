import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
};

export default nextConfig;
