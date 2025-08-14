import type { MetadataRoute } from 'next';
import { generateSitemapEntries } from '@/lib/sitemap-generator';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	return await generateSitemapEntries();
}
