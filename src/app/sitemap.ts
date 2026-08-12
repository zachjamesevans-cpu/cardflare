import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  const lastModified = new Date();

  return [
    { url: origin, lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: `${origin}/contact`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${origin}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    { url: `${origin}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
