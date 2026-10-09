import type { MetadataRoute } from "next";
import { generateSitemapEntries } from "@/lib/sitemap-generator";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	return await generateSitemapEntries();
}
