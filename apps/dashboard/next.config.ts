import path from "node:path";
import type { NextConfig } from "next";

function joinCspSources(...sources: (string | false)[]): string {
	return sources.filter(Boolean).join(" ");
}

const demoFrameAncestorSources = [
	"https://www.databuddy.cc",
	"https://databuddy.cc",
	"https://app.databuddy.cc",
	"https://preview.databuddy.cc",
	"https://staging.databuddy.cc",
] as const;

const nextConfig: NextConfig = {
	outputFileTracingRoot: path.join(process.cwd(), "../.."),
	serverExternalPackages: ["pg"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "cdn.databuddy.cc",
			},
			{
				protocol: "http",
				hostname: "localhost",
			},
			{
				protocol: "https",
				hostname: "www.google.com",
			},
			{
				protocol: "https",
				hostname: "flagcdn.com",
			},
			{
				protocol: "https",
				hostname: "multiavatar.com",
			},
			{
				protocol: "https",
				hostname: "api.dicebear.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
		],
	},
	transpilePackages: [],
	output: "standalone",
	async headers() {
		const securityHeaders = [
			{
				key: "Strict-Transport-Security",
				value: "max-age=31536000; includeSubDomains; preload",
			},
			{
				key: "X-Content-Type-Options",
				value: "nosniff",
			},
			{
				key: "Referrer-Policy",
				value: "strict-origin-when-cross-origin",
			},
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=()",
			},
		];

		const isDev = process.env.NODE_ENV === "development";
		const localhostSources = isDev
			? "http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
			: false;
		const localFrameAncestorSources = isDev
			? "http://localhost:* http://127.0.0.1:*"
			: false;
		const connectSources = joinCspSources(
			"'self'",
			localhostSources,
			"https://*.databuddy.cc",
			"https://*.useautumn.com",
			"https://api.openai.com",
			"https://hooks.slack.com",
			"wss://*.databuddy.cc"
		);
		const scriptSources = joinCspSources(
			"'self'",
			"'unsafe-inline'",
			isDev && "'unsafe-eval'",
			"'wasm-unsafe-eval'",
			"https://cdn.databuddy.cc"
		);

		const cspDirectives = [
			"default-src 'self'",
			`script-src ${scriptSources}`,
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com",
			"img-src 'self' data: blob: https://cdn.databuddy.cc https://www.google.com https://flagcdn.com https://api.dicebear.com https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
			`connect-src ${connectSources}`,
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		];

		const demoCspDirectives = [
			"default-src 'self'",
			`script-src ${scriptSources}`,
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com",
			"img-src 'self' data: blob: https://cdn.databuddy.cc https://www.google.com https://flagcdn.com https://api.dicebear.com https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
			`connect-src ${connectSources}`,
			`frame-ancestors ${joinCspSources(
				"'self'",
				...demoFrameAncestorSources,
				localFrameAncestorSources
			)}`,
			"base-uri 'self'",
			"form-action 'self'",
		];

		return [
			{
				source: "/demo/:path*",
				headers: [
					...securityHeaders,
					{
						key: "Content-Security-Policy",
						value: demoCspDirectives.join("; "),
					},
				],
			},
			{
				source: "/public/:path*",
				headers: [
					...securityHeaders,
					{
						key: "Content-Security-Policy",
						value: demoCspDirectives.join("; "),
					},
				],
			},
			{
				source: "/((?!demo|public).*)",
				headers: [
					...securityHeaders,
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Content-Security-Policy",
						value: cspDirectives.join("; "),
					},
				],
			},
		];
	},
};

export default nextConfig;
