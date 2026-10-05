import { createHash } from "node:crypto";
import {
	DATABUDDY_DESCRIPTION,
	DATABUDDY_DISAMBIGUATION,
} from "@databuddy/shared/agent-discovery";
import {
	AGENT_CREDIT_ALLOWANCES,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import { developerResources } from "@/lib/agent-discovery";
import {
	getAllCompetitorSlugs,
	getComparisonData,
} from "@/lib/comparison-config";
import { getDocumentationSections } from "@/lib/source";

export const revalidate = false;

const SITE_URL = "https://www.databuddy.cc";
const BASE_URL = `${SITE_URL}/docs`;

const HEADER = `# Databuddy

> ${DATABUDDY_DESCRIPTION}

${DATABUDDY_DISAMBIGUATION} For the full documentation corpus, see [llms-full.txt](${SITE_URL}/llms-full.txt).

`;

const PRODUCT_LINKS = [
	{
		title: "Databuddy",
		url: SITE_URL,
		description:
			"Product analytics for startups: visitors, custom events, funnels, goals, and user profiles from one cookieless script.",
	},
	{
		title: "Live demo",
		url: `${SITE_URL}/demo`,
		description:
			"A Databuddy dashboard with real traffic. No signup needed to look around.",
	},
	{
		title: "Error tracking",
		url: `${SITE_URL}/errors`,
		description:
			"JavaScript errors from the same script, with stack trace, page, browser, and how many visitors each error hit. Starts on the Hobby plan.",
	},
	{
		title: "Web Vitals",
		url: `${SITE_URL}/web-vitals`,
		description:
			"Real-user LCP, INP, CLS, FCP, and TTFB at p75 by page, browser, and country.",
	},
	{
		title: "Uptime monitoring",
		url: `${SITE_URL}/uptime`,
		description:
			"HTTP checks with alerts in Slack, email, or a webhook, plus public status pages.",
	},
	{
		title: "Feature flags",
		url: `${SITE_URL}/feature-flags`,
		description:
			"Roll out by percentage, user, or company in the same SDK as your analytics.",
	},
	{
		title: "Short links",
		url: `${SITE_URL}/links`,
		description: "Short links with clicks by source, country, and device.",
	},
];

const PRICING_LINKS = [
	{
		title: "Pricing",
		url: `${SITE_URL}/pricing.md`,
		description: `Free up to 10,000 events a month with ${AGENT_CREDIT_ALLOWANCES.free.month} AI credits for Databunny chat. Business includes ${INVESTIGATION_ALLOWANCES.intelligence} investigations a month and Scale ${INVESTIGATION_ALLOWANCES.intelligence_scale}; extra investigations cost $${INVESTIGATION_USAGE.priceUsd} each. Plans, event overage, and limits in Markdown.`,
	},
	{
		title: "Pricing API",
		url: `${SITE_URL}/api/pricing`,
		description: "Machine-readable plans, allowances, and overage tiers.",
	},
];

const DATABUNNY_LINKS = [
	{
		title: "Databunny",
		url: `${SITE_URL}/databunny`,
		description:
			"The built-in AI analyst. Chat is on every plan, runs on AI credits, and shows the query behind each answer. Business and Scale add daily or weekly investigations that compare the last 7 days with the prior 7 and end with evidence and a next step. Investigations are not real time, and some end without a root cause.",
	},
	{
		title: "Databuddy MCP server",
		url: `${BASE_URL}/api/mcp.md`,
		description:
			"Ask about your Databuddy data from Claude, Claude Code, or Cursor.",
	},
];

const TOP_GUIDES = [
	"getting-started",
	"Integrations/nextjs",
	"Integrations/react",
	"sdk/identify-users",
	"hooks",
	"api/mcp",
	"privacy/cookieless-analytics-guide",
	"compliance/gdpr-compliance-guide",
	"performance/core-web-vitals-guide",
];

function linkList(
	links: readonly { title: string; url: string; description: string }[]
) {
	return links
		.map((link) => `- [${link.title}](${link.url}): ${link.description}`)
		.join("\n");
}

export function GET() {
	const documentationSections = getDocumentationSections();
	const docPages = documentationSections.flatMap(({ pages }) => pages);

	const sections = documentationSections
		.map(({ title, pages }) => {
			const items = pages
				.map(
					(page) =>
						`- [${page.data.title}](${BASE_URL}/${page.file.flattenedPath}.md): ${page.data.description || ""}`
				)
				.join("\n");
			return `## ${title}\n${items}`;
		})
		.join("\n\n");

	const comparisons = getAllCompetitorSlugs().flatMap((slug) => {
		const comparison = getComparisonData(slug);
		return comparison
			? [
					{
						title: `Databuddy vs ${comparison.competitor.name}`,
						url: `${SITE_URL}/compare/${slug}`,
						description: comparison.seo.description,
					},
				]
			: [];
	});

	const topGuides = TOP_GUIDES.flatMap((path) => {
		const page = docPages.find((entry) => entry.file.flattenedPath === path);
		return page
			? [
					{
						title: page.data.title,
						url: `${BASE_URL}/${path}.md`,
						description: page.data.description || "",
					},
				]
			: [];
	});

	const body = `${HEADER}## Product\n${linkList(PRODUCT_LINKS)}\n\n## Pricing\n${linkList(PRICING_LINKS)}\n\n## Databunny\n${linkList(DATABUNNY_LINKS)}\n\n## Comparisons\n${linkList(comparisons)}\n\n## Top guides\n${linkList(topGuides)}\n\n## Developer Resources\n${linkList(developerResources)}\n\n${sections}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
		},
	});
}
