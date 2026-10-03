import {
	type AgentPurpose,
	BotCategory,
	isMarkdownFirstAccept,
	UNIDENTIFIED_AGENT_PREFIX,
	UNIDENTIFIED_AGENTS_PRODUCT,
} from "./types";
import wellKnownBots from "./well-known-bots.json";

export interface AiAgent {
	excludePatterns: RegExp[];
	id: string;
	name: string;
	operator: string;
	patterns: RegExp[];
	product: string;
	purpose: AgentPurpose;
	purposeInferred?: boolean;
	signatureAgent?: string;
}

export interface AgentSignals {
	accept?: string;
	signatureAgent?: string;
	userAgent: string;
}

const AI_PRODUCT_BY_OPERATOR: Record<string, string> = {
	OpenAI: "ChatGPT",
	Anthropic: "Claude",
	Google: "Google Gemini",
	Perplexity: "Perplexity",
	Microsoft: "Microsoft Copilot",
	Meta: "Meta AI",
	"Moonshot AI": "Kimi",
};

export const AI_AGENT_CLASSIFICATION: Record<
	string,
	{
		name?: string;
		operator: string;
		product?: string;
		purpose: AgentPurpose;
		purposeInferred?: boolean;
	} | null
> = {
	"ai-search-bot": {
		name: "AISearchBot",
		operator: "AISearchBot",
		purpose: "search_index",
	},
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
	"cohere-crawler": {
		name: "cohere-ai",
		operator: "Cohere",
		purpose: "user_fetch",
	},
	"commoncrawl-crawler": {
		operator: "Common Crawl",
		purpose: "training",
		purposeInferred: true,
	},
	crawl4ai: { name: "Crawl4AI", operator: "Crawl4AI", purpose: "agent" },
	crawlspace: { operator: "Crawlspace", purpose: "agent" },
	"diffbot-crawler": { operator: "Diffbot", purpose: "search_index" },
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
	"google-crawler-other": {
		operator: "Google",
		product: "Google",
		purpose: "training",
		purposeInferred: true,
	},
	"google-gemini-deep-research": { operator: "Google", purpose: "user_fetch" },
	"google-gemini-notebook": { operator: "Google", purpose: "user_fetch" },
	"iask-crawler": {
		name: "iAskSpider",
		operator: "iAsk",
		purpose: "search_index",
	},
	"imagesift-crawler": { operator: "Hive", purpose: "training" },
	imagespider: { operator: "ByteDance", purpose: "training" },
	img2dataset: { operator: "img2dataset", purpose: "training" },
	"infegy-crawler": null,
	"integralads-crawler": null,
	"kagi-fetcher": { operator: "Kagi", purpose: "user_fetch" },
	"kimi-bot": { operator: "Moonshot AI", purpose: "training" },
	"kimi-searchbot": { operator: "Moonshot AI", purpose: "search_index" },
	"kimi-user": { operator: "Moonshot AI", purpose: "user_fetch" },
	"laion-huggingface-processor": { operator: "LAION", purpose: "training" },
	"leadcrunch-crawler": null,
	"linkup-bot": { operator: "Linkup", purpose: "search_index" },
	"mediatoolkit-crawler": null,
	"meta-crawler": {
		name: "Meta-ExternalAgent",
		operator: "Meta",
		purpose: "training",
	},
	"meta-webindexer": { operator: "Meta", purpose: "search_index" },
	"meta-crawler-user": {
		name: "Meta-ExternalFetcher",
		operator: "Meta",
		purpose: "user_fetch",
	},
	"mistral-ai-index": { operator: "Mistral", purpose: "search_index" },
	"mistral-ai-training": { operator: "Mistral", purpose: "training" },
	"mistral-ai-user": { operator: "Mistral", purpose: "user_fetch" },
	"mozilla-tabstack": { operator: "Mozilla", purpose: "agent" },
	newsai: null,
	"nict-crawler": { operator: "NICT", purpose: "training" },
	"ntent-crawler": null,
	"omgili-crawler": {
		name: "Omgilibot",
		operator: "Webz.io",
		purpose: "training",
		purposeInferred: true,
	},
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
	shapbot: { operator: "Parallel", purpose: "search_index" },
	"storygize-crawler": null,
	"tavily-bot": { operator: "Tavily", purpose: "user_fetch" },
	"tiktok-crawler": { operator: "ByteDance", purpose: "training" },
	"timpi-crawler": { operator: "Timpi", purpose: "search_index" },
	"turnitin-crawler": null,
	"velen-crawler": { operator: "Hunter", purpose: "training" },
	"webzio-crawler-ai": {
		name: "Webzio-Extended",
		operator: "Webz.io",
		purpose: "training",
	},
	"you-crawler": { operator: "You.com", purpose: "search_index" },
	"zanista-bot": { operator: "Zanista", purpose: "search_index" },
};

function listedAgent(
	id: string,
	name: string,
	operator: string,
	product: string,
	purpose: AgentPurpose,
	pattern: RegExp,
	purposeInferred?: boolean
): AiAgent {
	return {
		id,
		name,
		operator,
		product,
		purpose,
		purposeInferred,
		patterns: [pattern],
		excludePatterns: [],
	};
}

function codingAgent(
	id: string,
	operator: string,
	product: string,
	pattern: RegExp
): AiAgent {
	return listedAgent(id, product, operator, product, "agent", pattern);
}

const TRAILING_SEPARATORS = /[\s/]+$/;
const HAS_UPPERCASE = /[A-Z]/;

function crawlerName(
	sampleUserAgents: string[],
	patterns: RegExp[]
): string | undefined {
	const names = sampleUserAgents.flatMap((userAgent) =>
		patterns.flatMap(
			(pattern) =>
				pattern.exec(userAgent)?.[0].replace(TRAILING_SEPARATORS, "") ?? []
		)
	);
	return names.find((name) => HAS_UPPERCASE.test(name)) ?? names[0];
}

const OPENCODE_AGENT = codingAgent(
	"opencode",
	"OpenCode",
	"OpenCode",
	/^opencode$/
);

export const AI_AGENTS: AiAgent[] = [
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
	OPENCODE_AGENT,
	codingAgent("devin", "Cognition", "Devin", /\bDevin\/\d/),
	codingAgent("v0", "Vercel", "v0", /\bv0bot\b/),
	codingAgent("manus", "Manus", "Manus", /Manus-User/),
	codingAgent("trae", "ByteDance", "Trae", /Trae-Agent/),
	listedAgent(
		"google-agent-urlcontext",
		"GoogleAgent-URLContext",
		"Google",
		"Google Gemini",
		"user_fetch",
		/GoogleAgent-URLContext/
	),
	listedAgent(
		"liner-bot",
		"LinerBot",
		"Liner",
		"Liner",
		"search_index",
		/LinerBot/
	),
	listedAgent(
		"shap-user",
		"Shap-User",
		"Parallel",
		"Parallel",
		"user_fetch",
		/Shap-User/
	),
	listedAgent(
		"cohere-training-data-crawler",
		"cohere-training-data-crawler",
		"Cohere",
		"Cohere",
		"training",
		/cohere-training-data-crawler/
	),
	listedAgent(
		"deepseek-bot",
		"DeepSeekBot",
		"DeepSeek",
		"DeepSeek",
		"training",
		/DeepSeekBot/,
		true
	),
	listedAgent(
		"pangu-bot",
		"PanguBot",
		"Huawei",
		"Huawei",
		"training",
		/PanguBot/,
		true
	),
	listedAgent(
		"chatglm-spider",
		"ChatGLM-Spider",
		"Zhipu AI",
		"ChatGLM",
		"training",
		/ChatGLM-Spider/,
		true
	),
	{
		excludePatterns: [],
		id: "chatgpt-agent",
		name: "ChatGPT agent",
		operator: "OpenAI",
		patterns: [],
		product: "ChatGPT",
		purpose: "agent",
		signatureAgent: "chatgpt.com",
	},
	...wellKnownBots.flatMap((bot) => {
		const classification = AI_AGENT_CLASSIFICATION[bot.id];
		if (!classification) {
			return [];
		}
		const patterns = bot.pattern.accepted.map((pattern) => new RegExp(pattern));
		return {
			...classification,
			id: bot.id,
			name:
				classification.name ??
				crawlerName(bot.instances?.accepted ?? [], patterns) ??
				bot.id,
			product:
				classification.product ??
				AI_PRODUCT_BY_OPERATOR[classification.operator] ??
				classification.operator,
			patterns,
			excludePatterns: bot.pattern.forbidden.map(
				(pattern) => new RegExp(pattern)
			),
		};
	}),
];

export function matchAiAgent(userAgent: string): AiAgent | null {
	return (
		AI_AGENTS.find(
			(agent) =>
				agent.patterns.some((pattern) => pattern.test(userAgent)) &&
				!agent.excludePatterns.some((pattern) => pattern.test(userAgent))
		) ?? null
	);
}

export function agentBotCategory(agent: AiAgent): BotCategory {
	return agent.purpose === "training" || agent.purpose === "search_index"
		? BotCategory.AI_CRAWLER
		: BotCategory.AI_ASSISTANT;
}

function signedAgent(signatureAgent: string): AiAgent | null {
	const host = URL.parse(signatureAgent.replaceAll('"', "").trim())?.hostname;
	if (!host) {
		return null;
	}
	return (
		AI_AGENTS.find((agent) => agent.signatureAgent === host) ?? {
			excludePatterns: [],
			id: host,
			name: host,
			operator: host,
			patterns: [],
			product: host,
			purpose: "agent",
		}
	);
}

const USER_AGENT_TOKEN = /^[\w.-]{1,40}/;

function unidentifiedAgent(userAgent: string): AiAgent {
	const token =
		USER_AGENT_TOKEN.exec(userAgent.trim())?.[0].toLowerCase() || "unknown";
	return {
		excludePatterns: [],
		id: `${UNIDENTIFIED_AGENT_PREFIX}${token}`,
		name: token,
		operator: UNIDENTIFIED_AGENTS_PRODUCT,
		patterns: [],
		product: UNIDENTIFIED_AGENTS_PRODUCT,
		purpose: "agent",
	};
}

const NAMED_NON_AI_BOT_CATEGORIES = new Set<BotCategory>([
	BotCategory.MONITORING,
	BotCategory.SEARCH_ENGINE,
	BotCategory.SEO_TOOL,
	BotCategory.SOCIAL_MEDIA,
]);

const WHITESPACE = /\s+/g;
const OPENCODE_MARKDOWN_ACCEPT =
	"text/markdown;q=1.0,text/x-markdown;q=0.9,text/plain;q=0.8,text/html;q=0.7,*/*;q=0.1";

export function identifyAiAgent(
	{ accept, signatureAgent, userAgent }: AgentSignals,
	botCategory?: BotCategory
): AiAgent | null {
	const known = matchAiAgent(userAgent);
	if (known) {
		return known;
	}
	if (botCategory && NAMED_NON_AI_BOT_CATEGORIES.has(botCategory)) {
		return null;
	}
	const signed = signatureAgent ? signedAgent(signatureAgent) : null;
	if (signed) {
		return signed;
	}
	if (
		userAgent.startsWith("Mozilla/") &&
		accept?.replace(WHITESPACE, "") === OPENCODE_MARKDOWN_ACCEPT
	) {
		return OPENCODE_AGENT;
	}
	return isMarkdownFirstAccept(accept ?? "")
		? unidentifiedAgent(userAgent)
		: null;
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
