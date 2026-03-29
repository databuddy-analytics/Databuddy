import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/status/", "/public/"],
      disallow: ["/", "/.well-known/", "/_next/"],
    },
  };
}
