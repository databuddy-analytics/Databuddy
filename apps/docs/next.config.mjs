import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	compress: true,
	poweredByHeader: false,

	// biome-ignore lint: false positive
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'X-Frame-Options',
						value: 'DENY',
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
				],
			},
			{
				source: '/docs/:path*',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=3600, stale-while-revalidate=86400',
					},
					{
						key: 'X-Robots-Tag',
						value:
							'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
					},
				],
			},
		];
	},

	// biome-ignore lint: false positive
	async redirects() {
		return [
			{
				source: '/documentation/:path*',
				destination: '/docs/:path*',
				permanent: true,
			},
			{
				source: '/guide/:path*',
				destination: '/docs/:path*',
				permanent: true,
			},
			{
				source: '/docs/docs/:path*',
				destination: '/docs/:path*',
				permanent: true,
			},
		];
	},

	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'icons.duckduckgo.com',
			},
			{
				protocol: 'https',
				hostname: 'images.marblecms.com',
			},
			{
				protocol: 'https',
				hostname: 'lh3.googleusercontent.com',
			},
			{
				protocol: 'https',
				hostname: 'avatars.githubusercontent.com',
			},
			{
				protocol: 'https',
				hostname: 'pbs.twimg.com',
			},
		],
		formats: ['image/webp', 'image/avif'],
		minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
	},

	experimental: {
		optimizePackageImports: [
			'fumadocs-ui',
			'lucide-react',
			'@phosphor-icons/react',
		],
	},
};

export default withMDX(config);
