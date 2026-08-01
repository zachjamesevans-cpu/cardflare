import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in areas. Each already sends `noindex`; this stops crawlers
      // spending time on routes that will only redirect them to sign in.
      disallow: ["/admin", "/store", "/login", "/auth/", "/play"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
