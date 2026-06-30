import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@databuddy/ui", "@databuddy/rpc"],
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "cdn.databuddy.cc" },
			{ protocol: "https", hostname: "api.dicebear.com" },
			{ protocol: "https", hostname: "avatars.githubusercontent.com" },
			{ protocol: "https", hostname: "lh3.googleusercontent.com" },
			...(process.env.NODE_ENV === "production"
				? []
				: [{ protocol: "http" as const, hostname: "localhost" }]),
		],
	},
	output: "standalone",
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains; preload",
					},
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
					{
						key: "Cache-Control",
						value: "public, s-maxage=60, stale-while-revalidate=300",
					},
				],
			},
		];
	},
};

export default nextConfig;
