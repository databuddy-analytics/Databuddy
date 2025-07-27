import type { MetadataRoute } from 'next';

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
		sitemap: 'https://www.databuddy.cc/sitemap.xml',
		host: 'https://www.databuddy.cc',
	};
}
