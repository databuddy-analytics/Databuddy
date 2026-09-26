import { z } from "zod";
import { AI_PRODUCT_BY_OPERATOR } from "./types";
import wellKnownBots from "./well-known-bots.json";

export type AgentPurpose = "training" | "search_index" | "user_fetch" | "agent";

export const AI_AGENT_CLASSIFICATION: Record<
	string,
	{
		operator: string;
		purpose: AgentPurpose;
	} | null
> = {
	"ai-search-bot": { operator: "AISearchBot", purpose: "search_index" },
	"ai2-crawler": { operator: "Ai2", purpose: "training" },
	"ai2-crawler-dolma": { operator: "Ai2", purpose: "training" },
	"aihit-crawler": null,
	"amazon-bedrock-agentcore-browser": { operator: "Amazon", purpose: "agent" },
	"amazon-crawler": { operator: "Amazon", purpose: "training" },
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
	"apple-crawler": { operator: "Apple", purpose: "search_index" },
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
	"google-crawler-other": { operator: "Google", purpose: "training" },
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

function aiProductOf(operator: string): string {
	return AI_PRODUCT_BY_OPERATOR[operator] ?? operator;
}

const wellKnownBotSchema = z.object({
	id: z.string(),
	pattern: z.object({
		accepted: z.array(z.string()),
		forbidden: z.array(z.string()),
	}),
});

export interface AiAgent {
	excludePatterns: RegExp[];
	id: string;
	operator: string;
	patterns: RegExp[];
	product: string;
	purpose: AgentPurpose;
}

function codingAgent(
	id: string,
	operator: string,
	product: string,
	pattern: RegExp
): AiAgent {
	return {
		id,
		operator,
		product,
		purpose: "agent",
		patterns: [pattern],
		excludePatterns: [],
	};
}

const CODING_AGENTS: AiAgent[] = [
	codingAgent(
		"claude-code",
		"Anthropic",
		"Claude Code",
		/Claude-User \(claude-code\//
	),
	codingAgent("gemini-cli", "Google", "Gemini CLI", /Google-Gemini-CLI\//),
	codingAgent(
		"aider",
		"Aider",
		"Aider",
		/Aider\/[\d.]+ \+https:\/\/aider\.chat/
	),
	codingAgent("zed", "Zed", "Zed", /^Zed\/[\d.]+ \(/),
	codingAgent("opencode", "OpenCode", "OpenCode", /^opencode$/),
	codingAgent("devin", "Cognition", "Devin", /\bDevin\/\d/),
	codingAgent("v0", "Vercel", "v0", /\bv0bot\b/),
	codingAgent("manus", "Manus", "Manus", /Manus-User/i),
];

function toAiAgent(bot: z.infer<typeof wellKnownBotSchema>): AiAgent | null {
	const classification = AI_AGENT_CLASSIFICATION[bot.id];
	if (!classification) {
		return null;
	}
	return {
		...classification,
		id: bot.id,
		product: aiProductOf(classification.operator),
		patterns: bot.pattern.accepted.map((p) => new RegExp(p)),
		excludePatterns: bot.pattern.forbidden.map((p) => new RegExp(p)),
	};
}

export const AI_AGENTS: AiAgent[] = [
	...CODING_AGENTS,
	...z
		.array(wellKnownBotSchema)
		.parse(wellKnownBots.filter((bot) => bot.id in AI_AGENT_CLASSIFICATION))
		.map(toAiAgent)
		.filter((agent) => agent !== null),
];

export function matchAiAgent(userAgent: string): AiAgent | null {
	return (
		AI_AGENTS.find(
			(agent) =>
				agent.patterns.some((p) => p.test(userAgent)) &&
				!agent.excludePatterns.some((p) => p.test(userAgent))
		) ?? null
	);
}

const SETUP_CHECK_TOKEN = /DatabuddySetupCheck\/([\w-]{1,64})/;

export function setupCheckUserAgent(nonce: string): string {
	return `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot) DatabuddySetupCheck/${nonce}`;
}

export function setupCheckNonce(userAgent: string): string | null {
	return SETUP_CHECK_TOKEN.exec(userAgent)?.[1] ?? null;
}

export function setupCheckKey(websiteId: string, nonce: string): string {
	return `ai-agent-setup-check:${websiteId}:${nonce}`;
}
