import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/public/",
			disallow: ["/", "/.well-known/", "/_next/"],
		},
	};
}
