import { SITE_URL } from "@/app/util/constants";

export const revalidate = 3600;

const CRAWL_DISALLOW = [
	"/api/",
	"/_next/",
	"/admin/",
	"/demo/private/",
	"/contact/thanks",
];

const SEARCH_AGENTS = [
	"GPTBot",
	"ChatGPT-User",
	"ClaudeBot",
	"Claude-Web",
	"PerplexityBot",
	"Amazonbot",
	"Google-Extended",
];

const TRAINING_AGENTS = ["CCBot", "Bytespider", "ByteSpider"];

function allowBlock(userAgent: string) {
	return [
		`User-agent: ${userAgent}`,
		"Allow: /",
		...CRAWL_DISALLOW.map((path) => `Disallow: ${path}`),
	].join("\n");
}

function disallowBlock(userAgent: string) {
	return [`User-agent: ${userAgent}`, "Disallow: /"].join("\n");
}

export function GET() {
	const body = [
		allowBlock("*"),
		...SEARCH_AGENTS.map(allowBlock),
		...TRAINING_AGENTS.map(disallowBlock),
		`Sitemap: ${SITE_URL}/sitemap.xml`,
		`Schemamap: ${SITE_URL}/schemamap.xml`,
		"Content-Signal: search=yes, ai-input=yes, ai-train=no",
		"",
	].join("\n\n");

	return new Response(body, {
		headers: {
			"Cache-Control": "public, max-age=3600, must-revalidate",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
