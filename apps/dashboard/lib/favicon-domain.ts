/**
 * Resolves a hostname to a canonical host for Google S2 favicon URLs
 * (`https://www.google.com/s2/favicons?domain={host}`). Use when several CDN /
 * product domains should show the same brand icon as the public marketing site.
 *
 * Rules are ordered longest-`pattern` first so more specific hosts win (e.g.
 * `googleads.g.doubleclick.net` before any hypothetical shorter suffix).
 */
const FAVICON_CANONICAL_RULES: ReadonlyArray<{
	pattern: string;
	canonical: string;
}> = [
	{ pattern: "googleads.g.doubleclick.net", canonical: "ads.google.com" },
	{ pattern: "plugins.framercdn.com", canonical: "framer.com" },
	{ pattern: "googlesyndication.com", canonical: "ads.google.com" },
	{ pattern: "syndicatedsearch.goog", canonical: "ads.google.com" },
	{ pattern: "googleadservices.com", canonical: "ads.google.com" },
	{ pattern: "checkout.stripe.com", canonical: "stripe.com" },
	{ pattern: "billing.stripe.com", canonical: "stripe.com" },
	{ pattern: "invoice.stripe.com", canonical: "stripe.com" },
	{ pattern: "framercdn.com", canonical: "framer.com" },
	{ pattern: "netlify.app", canonical: "netlify.com" },
	{ pattern: "workers.dev", canonical: "cloudflare.com" },
	{ pattern: "figma.design", canonical: "figma.com" },
	{ pattern: "vercel.app", canonical: "vercel.com" },
	{ pattern: "pages.dev", canonical: "cloudflare.com" },
	{ pattern: "canva.me", canonical: "canva.com" },
];

function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
	return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

export function resolveFaviconCanonicalHost(hostname: string): string {
	for (const { pattern, canonical } of FAVICON_CANONICAL_RULES) {
		if (hostnameMatchesPattern(hostname, pattern)) {
			return canonical;
		}
	}
	return hostname;
}
