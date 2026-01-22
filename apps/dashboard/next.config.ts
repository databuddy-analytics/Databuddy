import type { NextConfig } from"next";

const nextConfig: NextConfig = {
	experimental: {
		optimizePackageImports: ["@phosphor-icons/react"],
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		remotePatterns: [
			{
				protocol:"https",
				hostname:"cdn.databuddy.cc",
			},
			{
				protocol:"http",
				hostname:"localhost",
			},
			{
				protocol:"https",
				hostname:"icons.duckduckgo.com",
			},
			{
				protocol:"https",
				hostname:"flagcdn.com",
			},
			{
				protocol:"https",
				hostname:"multiavatar.com",
			},
		],
	},
	transpilePackages: [],
	output:"standalone",
	async rewrites() {
		return [
			{
				source:"/geojson/:path*",
				destination:"https://cdn.databuddy.cc/geojson/:path*",
			},
		];
	},
};

export function headers() {
	return [
		{
			source:"/((?!demo).*)",
			headers: [
				{
					key:"Strict-Transport-Security",
					value:"max-age=31536000; includeSubDomains; preload",
				},
				{
					key:"X-Content-Type-Options",
					value:"nosniff",
				},
				{
					key:"Referrer-Policy",
					value:"strict-origin-when-cross-origin",
				},
				{
					key:"Permissions-Policy",
					value:"camera=(), microphone=(), geolocation=()",
				},
				{
					key:"X-Frame-Options",
					value:"DENY",
				},
				{
					key:"Content-Security-Policy",
					value:"frame-ancestors 'none'",
				},
			],
		},
	];
}

export default nextConfig;
