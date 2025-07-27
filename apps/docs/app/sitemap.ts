import type { MetadataRoute } from 'next';
import { generateSitemapEntries } from '@/lib/sitemap-generator';

export default function sitemap(): MetadataRoute.Sitemap {
  return generateSitemapEntries();
}
