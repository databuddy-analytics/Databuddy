import type { MetadataRoute } from "next";
import { getStatusPageUrl } from "@/lib/status-url";
import { rpcClient } from "@/lib/orpc";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const pages = await rpcClient.statusPage.listPublic();

	return pages.map((page) => ({
		url: getStatusPageUrl(page.slug),
		lastModified: page.updatedAt,
		changeFrequency: "daily",
		priority: 0.7,
	}));
}
