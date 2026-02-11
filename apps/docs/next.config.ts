import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
	reactStrictMode: true,
	async headers() {
		return await [
			{
				source: "/(.*)",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "X-XSS-Protection",
						value: "1; mode=block",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
				],
			},
			{
				source: "/docs/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=3600, stale-while-revalidate=86400",
					},
					{
						key: "X-Robots-Tag",
						value:
							"index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
					},
				],
			},
		];
	},

	async rewrites() {
		return [
			{
				source: "/docs/:path*.md",
				destination: "/api/docs/raw/:path*",
			},
			{
				source: "/docs/:path*",
				destination: "/api/docs/raw/:path*",
				has: [
					{
						type: "header",
						key: "Accept",
						value: ".*text/markdown.*",
					},
				],
			},
		];
	},

	async redirects() {
		return await [
			{
				source: "/documentation/:path*",
				destination: "/docs/:path*",
				permanent: true,
			},
			{
				source: "/guide/:path*",
				destination: "/docs/:path*",
				permanent: true,
			},
			{
				source: "/docs/docs/:path*",
				destination: "/docs/:path*",
				permanent: true,
			},
		];
	},

	images: {
		remotePatterns: [
			{
				protocol: "https" as const,
				hostname: "icons.duckduckgo.com",
			},
			{
				protocol: "https" as const,
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https" as const,
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https" as const,
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https" as const,
				hostname: "pbs.twimg.com",
			},
			{
				protocol: "https" as const,
				hostname: "api.producthunt.com",
			},
		],
		minimumCacheTTL: 60 * 60 * 24 * 30,
	},

	experimental: {
		optimizePackageImports: [
			"fumadocs-ui",
			"lucide-react",
			"@phosphor-icons/react",
		],
	},
};

export default withMDX(config);
