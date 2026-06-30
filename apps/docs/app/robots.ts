import type { MetadataRoute } from "next";
import { SITE_URL } from "./util/constants";

const CRAWL_DISALLOW = [
	"/api/",
	"/_next/",
	"/admin/",
	"/*.json",
	"/demo/private/",
	"/contact/thanks",
];

export default function robots(): MetadataRoute.Robots {
	const allowAll = {
		allow: "/",
		disallow: CRAWL_DISALLOW,
	};

	return {
		rules: [
			{ userAgent: "*", ...allowAll },
			{ userAgent: "GPTBot", ...allowAll },
			{ userAgent: "ChatGPT-User", ...allowAll },
			{ userAgent: "ClaudeBot", ...allowAll },
			{ userAgent: "Claude-Web", ...allowAll },
			{ userAgent: "PerplexityBot", ...allowAll },
			{ userAgent: "Amazonbot", ...allowAll },
			{ userAgent: "Google-Extended", ...allowAll },
			{ userAgent: "Bytespider", ...allowAll },
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
