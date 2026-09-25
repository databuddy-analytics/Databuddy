import { z } from "zod";
import wellKnownBots from "./well-known-bots.json";

export type AgentPurpose = "training" | "search_index" | "user_fetch" | "agent";

export const AI_AGENT_CLASSIFICATION: Record<
	string,
	{ operator: string; purpose: AgentPurpose } | null
> = {
	"ai-search-bot": { operator: "AISearchBot", purpose: "search_index" },
	"ai2-crawler": { operator: "Ai2", purpose: "training" },
	"ai2-crawler-dolma": { operator: "Ai2", purpose: "training" },
	"aihit-crawler": null,
	"amazon-bedrock-agentcore-browser": { operator: "Amazon", purpose: "agent" },
	"amazon-searchbot": { operator: "Amazon", purpose: "search_index" },
	"amazon-user": { operator: "Amazon", purpose: "user_fetch" },
	"anomura-crawler": { operator: "Anomura", purpose: "search_index" },
	"anthropic-ai": { operator: "Anthropic", purpose: "training" },
	"anthropic-crawler": { operator: "Anthropic", purpose: "training" },
	"anthropic-crawler-search": {
		operator: "Anthropic",
		purpose: "search_index",
	},
	"anthropic-crawler-user": { operator: "Anthropic", purpose: "user_fetch" },
	"apify-bot": { operator: "Apify", purpose: "agent" },
	"atlassian-bot": { operator: "Atlassian", purpose: "user_fetch" },
	"azure-ai-searchbot": { operator: "Microsoft", purpose: "search_index" },
	"botify-crawler": null,
	brightbot: { operator: "Bright Data", purpose: "training" },
	"bytedance-crawler": { operator: "ByteDance", purpose: "training" },
	"channel3-bot": { operator: "Channel3", purpose: "search_index" },
	"cloudflare-ai-search": { operator: "Cloudflare", purpose: "search_index" },
	"cohere-crawler": { operator: "Cohere", purpose: "user_fetch" },
	"commoncrawl-crawler": { operator: "Common Crawl", purpose: "training" },
	crawl4ai: { operator: "Crawl4AI", purpose: "agent" },
	crawlspace: { operator: "Crawlspace", purpose: "agent" },
	"diffbot-crawler": { operator: "Diffbot", purpose: "training" },
	"duckassist-bot": { operator: "DuckDuckGo", purpose: "user_fetch" },
	"exa-searchbot": { operator: "Exa", purpose: "search_index" },
	"facebook-crawler": null,
	"facebook-share-crawler": null,
	"firecrawl-agent": { operator: "Firecrawl", purpose: "agent" },
	"flyriver-bot": { operator: "Flyriver", purpose: "training" },
	friendlycrawler: { operator: "FriendlyCrawler", purpose: "training" },
	"glutenfreepleasure-crawler": null,
	"google-agent": { operator: "Google", purpose: "agent" },
	"google-crawler-cloudvertex": { operator: "Google", purpose: "search_index" },
	"google-gemini-deep-research": { operator: "Google", purpose: "user_fetch" },
	"google-gemini-notebook": { operator: "Google", purpose: "user_fetch" },
	"iask-crawler": { operator: "iAsk", purpose: "search_index" },
	"imagesift-crawler": { operator: "Hive", purpose: "training" },
	imagespider: { operator: "imageSpider", purpose: "training" },
	img2dataset: { operator: "img2dataset", purpose: "training" },
	"infegy-crawler": null,
	"integralads-crawler": null,
	"kagi-fetcher": { operator: "Kagi", purpose: "user_fetch" },
	"kimi-bot": { operator: "Moonshot AI", purpose: "training" },
	"kimi-searchbot": { operator: "Moonshot AI", purpose: "search_index" },
	"kimi-user": { operator: "Moonshot AI", purpose: "user_fetch" },
	"laion-huggingface-processor": { operator: "LAION", purpose: "training" },
	"leadcrunch-crawler": null,
	"linkup-bot": { operator: "Linkup", purpose: "user_fetch" },
	"mediatoolkit-crawler": null,
	"meta-crawler": { operator: "Meta", purpose: "training" },
	"meta-crawler-user": { operator: "Meta", purpose: "user_fetch" },
	"mistral-ai-index": { operator: "Mistral", purpose: "search_index" },
	"mistral-ai-training": { operator: "Mistral", purpose: "training" },
	"mistral-ai-user": { operator: "Mistral", purpose: "user_fetch" },
	"mozilla-tabstack": { operator: "Mozilla", purpose: "agent" },
	newsai: null,
	"nict-crawler": { operator: "NICT", purpose: "training" },
	"ntent-crawler": null,
	"omgili-crawler": { operator: "Webz.io", purpose: "training" },
	"openai-crawler": { operator: "OpenAI", purpose: "training" },
	"openai-crawler-search": { operator: "OpenAI", purpose: "search_index" },
	"openai-crawler-user": { operator: "OpenAI", purpose: "user_fetch" },
	"perplexity-crawler": { operator: "Perplexity", purpose: "search_index" },
	"perplexity-user": { operator: "Perplexity", purpose: "user_fetch" },
	"petalsearch-crawler": { operator: "Huawei", purpose: "search_index" },
	"phind-bot": { operator: "Phind", purpose: "user_fetch" },
	"primal-crawler": null,
	"python-scrapy": null,
	"safedns-crawler": null,
	"sbintuitions-bot": { operator: "SB Intuitions", purpose: "training" },
	"searchatlas-crawler": null,
	"semanticscholar-crawler": null,
	"sentione-crawler": null,
	shapbot: { operator: "ShapBot", purpose: "search_index" },
	"storygize-crawler": null,
	"tavily-bot": { operator: "Tavily", purpose: "user_fetch" },
	"tiktok-crawler": { operator: "ByteDance", purpose: "training" },
	"timpi-crawler": { operator: "Timpi", purpose: "search_index" },
	"turnitin-crawler": null,
	"velen-crawler": { operator: "Velen", purpose: "training" },
	"webzio-crawler-ai": { operator: "Webz.io", purpose: "training" },
	"you-crawler": { operator: "You.com", purpose: "search_index" },
	"zanista-bot": { operator: "Zanista", purpose: "search_index" },
};

const ipRangeSourceSchema = z.object({
	type: z.enum(["http-json", "http-text", "http-csv"]),
	url: z.url(),
	selector: z.string().optional(),
});

const wellKnownBotSchema = z.object({
	id: z.string(),
	pattern: z.object({
		accepted: z.array(z.string()),
		forbidden: z.array(z.string()),
	}),
	verification: z
		.array(
			z.discriminatedUnion("type", [
				z.object({
					type: z.literal("cidr"),
					sources: z.array(ipRangeSourceSchema),
				}),
				z.object({
					type: z.literal("ip"),
					sources: z.array(ipRangeSourceSchema).optional(),
					ips: z.array(z.string()).optional(),
				}),
				z.object({ type: z.literal("dns"), masks: z.array(z.string()) }),
			])
		)
		.optional(),
});

const ipPrefixListSchema = z.object({
	prefixes: z.array(
		z.object({
			ipv4Prefix: z.string().optional(),
			ipv6Prefix: z.string().optional(),
		})
	),
});

export interface IpRangeSource {
	format: "json" | "text" | "csv";
	url: string;
}

export interface AiAgent {
	dnsMasks: string[];
	excludePatterns: RegExp[];
	id: string;
	ipRangeSources: IpRangeSource[];
	ipRanges: string[];
	operator: string;
	patterns: RegExp[];
	purpose: AgentPurpose;
}

function toIpRangeSource(
	source: z.infer<typeof ipRangeSourceSchema>
): IpRangeSource | null {
	if (source.type === "http-text") {
		return { format: "text", url: source.url };
	}
	if (source.type === "http-csv") {
		return { format: "csv", url: source.url };
	}
	return source.selector?.startsWith("$.prefixes[*]")
		? { format: "json", url: source.url }
		: null;
}

function toAiAgent(bot: z.infer<typeof wellKnownBotSchema>): AiAgent | null {
	const classification = AI_AGENT_CLASSIFICATION[bot.id];
	if (!classification) {
		return null;
	}
	const agent: AiAgent = {
		...classification,
		id: bot.id,
		patterns: bot.pattern.accepted.map((p) => new RegExp(p)),
		excludePatterns: bot.pattern.forbidden.map((p) => new RegExp(p)),
		ipRangeSources: [],
		ipRanges: [],
		dnsMasks: [],
	};
	for (const verification of bot.verification ?? []) {
		if (verification.type === "dns") {
			agent.dnsMasks.push(...verification.masks);
			continue;
		}
		if (verification.type === "ip") {
			agent.ipRanges.push(...(verification.ips ?? []));
		}
		for (const source of verification.sources ?? []) {
			const ipRangeSource = toIpRangeSource(source);
			if (ipRangeSource) {
				agent.ipRangeSources.push(ipRangeSource);
			}
		}
	}
	return agent;
}

export const AI_AGENTS: AiAgent[] = z
	.array(wellKnownBotSchema)
	.parse(wellKnownBots.filter((bot) => bot.id in AI_AGENT_CLASSIFICATION))
	.map(toAiAgent)
	.filter((agent) => agent !== null);

export function matchAiAgent(userAgent: string): AiAgent | null {
	return (
		AI_AGENTS.find(
			(agent) =>
				agent.patterns.some((p) => p.test(userAgent)) &&
				!agent.excludePatterns.some((p) => p.test(userAgent))
		) ?? null
	);
}

export function parseIpRanges(
	format: IpRangeSource["format"],
	body: string
): string[] {
	if (format === "json") {
		const parsed = ipPrefixListSchema.safeParse(JSON.parse(body));
		return parsed.success
			? parsed.data.prefixes.flatMap((p) =>
					[p.ipv4Prefix, p.ipv6Prefix].filter((prefix) => prefix !== undefined)
				)
			: [];
	}
	return body
		.split("\n")
		.map((line) => (format === "csv" ? line.split(",")[0] : line)?.trim() ?? "")
		.filter((prefix) => prefix && !prefix.startsWith("#"));
}

const TRAILING_DOT = /\.$/;

export function isDnsMaskMatch(mask: string, hostname: string): boolean {
	const pattern = mask
		.replaceAll(".", "\\.")
		.replaceAll("*", ".?")
		.replaceAll("@", ".*");
	return new RegExp(`^${pattern}$`, "i").test(
		hostname.replace(TRAILING_DOT, "")
	);
}
