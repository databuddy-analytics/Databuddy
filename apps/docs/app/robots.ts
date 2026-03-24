import type { MetadataRoute } from "next";
import { SITE_URL } from "./util/constants";

const CRAWL_DISALLOW = [
	"/api/",
	"/_next/",
	"/admin/",
	"*.json",
	"/demo/private/",
	"/contact/thanks",
];

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: CRAWL_DISALLOW,
			},
			{
				userAgent: "GPTBot",
				allow: "/",
				disallow: CRAWL_DISALLOW,
			},
			{
				userAgent: "ChatGPT-User",
				allow: "/",
				disallow: CRAWL_DISALLOW,
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
