import type { MetadataRoute } from 'next';
import { SITE_URL } from './util/constants';

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: ['/api/', '/_next/', '/admin/', '*.json', '/demo/private/'],
			},
			{
				userAgent: 'GPTBot',
				allow: ['/docs/', '/blog/', '/llms.txt'],
				disallow: '/',
			},
			{
				userAgent: 'ChatGPT-User',
				allow: ['/docs/', '/blog/', '/llms.txt'],
				disallow: '/',
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
