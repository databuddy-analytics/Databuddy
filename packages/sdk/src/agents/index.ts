import {
	type ContentFormat,
	contentFormat,
	isAssetPath,
	isMarkdownFirstAccept,
} from "@databuddy/shared/bot-detection/types";
import { detectClientId } from "../utils";

export interface TrackAgentsOptions {
	apiUrl?: string;
	timeoutMs?: number;
	websiteId?: string;
}

interface NodeRequest {
	headers: Record<string, string | string[] | undefined>;
	method?: string;
	originalUrl?: string;
	url?: string;
}

export const AI_AGENT_USER_AGENT =
	/Claude-User \(claude-code\/|Google-Gemini-CLI\/|Aider\/[\d.]+ \+https:\/\/aider\.chat|^Zed\/[\d.]+ \(|^opencode$|\bDevin\/\d|\bv0bot\b|Manus-User|GoogleOther|AISearchBot|CCBot|Applebot|omgili|ICC-Crawler|Diffbot\/|VelenPublicWebCrawler|Bytespider|Amazonbot|PetalBot|GPTBot|ChatGPT-User|YouBot|ImagesiftBot|PerplexityBot\/|[cC]laude(?:[bB]ot|-[Ww]eb)|Claude-User|Claude-SearchBot|AI2Bot\s|Ai2Bot-Dolma|FriendlyCrawler|Google-CloudVertexBot|[Mm]eta-[Ee]xternal[Aa]gent|meta-externalfetcher|OAI-SearchBot|Timpibot|webzio-extended|cohere-ai|iaskspider|img2dataset|TikTokSpider|Perplexity-?User|SBIntuitionsBot\/|Google-(?:GeminiNotebook|NotebookLM)|Google-Agent|Gemini-Deep-Research|anthropic-ai|MistralAI-User|MistralAI-Index|MistralAI-Training|DuckAssistBot|FirecrawlAgent|Cloudflare-(?:AI-Search|AutoRAG)|TavilyBot|ShapBot|ZanistaBot|kagi-fetcher|Brightbot|atlassian-bot|AzureAI-SearchBot|Amzn-SearchBot|Amzn-User|Amazon-Bedrock-AgentCore-Browser|Anomura\/|ApifyBot|Channel3Bot|imageSpider|laion-huggingface-processor|LinkupBot|PhindBot|Flyriverbot|crawl4ai|Mozilla-Tabstack|ExaSearchBot|KimiBot|Kimi-User|Kimi-SearchBot|Crawlspace/;

const DEFAULT_API_URL = "https://basket.databuddy.cc";
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_HEADER_LENGTH = 512;
const MAX_REFERRER_LENGTH = 2048;

function isFetchRequest(request: Request | NodeRequest): request is Request {
	return typeof Request !== "undefined" && request instanceof Request;
}

function header(request: Request | NodeRequest, name: string): string {
	if (isFetchRequest(request)) {
		return request.headers.get(name) ?? "";
	}
	const value = request.headers[name];
	return (Array.isArray(value) ? value[0] : value) ?? "";
}

interface AgentHit {
	accept?: string;
	format: ContentFormat;
	host: string;
	path: string;
	referrer?: string;
	signatureAgent?: string;
	userAgent: string;
	websiteId: string;
}

function readAgentHit(
	request: Request | NodeRequest,
	websiteId: string
): AgentHit | null {
	const method = request.method ?? "GET";
	if (method !== "GET" && method !== "HEAD") {
		return null;
	}
	const userAgent = header(request, "user-agent");
	const signatureAgent = header(request, "signature-agent");
	const accept = header(request, "accept").slice(0, MAX_HEADER_LENGTH);
	const isMarkdownFirstClient =
		isMarkdownFirstAccept(accept) && !header(request, "sec-fetch-mode");
	const isAgent =
		signatureAgent !== "" ||
		isMarkdownFirstClient ||
		AI_AGENT_USER_AGENT.test(userAgent);
	if (!isAgent) {
		return null;
	}
	const url = new URL(
		("originalUrl" in request && request.originalUrl) || request.url || "/",
		"http://localhost"
	);
	if (isAssetPath(url.pathname)) {
		return null;
	}
	return {
		accept: accept || undefined,
		format: contentFormat(url.pathname, accept),
		host:
			header(request, "x-forwarded-host").split(",")[0]?.trim() ||
			header(request, "host") ||
			url.host,
		path: url.pathname,
		referrer:
			header(request, "referer").slice(0, MAX_REFERRER_LENGTH) || undefined,
		signatureAgent: signatureAgent.slice(0, MAX_HEADER_LENGTH) || undefined,
		userAgent: userAgent.slice(0, MAX_HEADER_LENGTH),
		websiteId,
	};
}

export async function trackAgents(
	request: Request | NodeRequest,
	options: TrackAgentsOptions = {}
): Promise<void> {
	try {
		const websiteId =
			detectClientId(options.websiteId) ??
			(typeof process === "undefined"
				? undefined
				: process.env.DATABUDDY_WEBSITE_ID);
		const hit = websiteId ? readAgentHit(request, websiteId) : null;
		if (!hit) {
			return;
		}
		await fetch(`${options.apiUrl ?? DEFAULT_API_URL}/ai-traffic`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(hit),
			signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
		});
	} catch {
		return;
	}
}

export function proxy(
	request: Request,
	event?: { waitUntil?(promise: Promise<unknown>): void }
): void {
	const tracking = trackAgents(request);
	if (typeof event?.waitUntil === "function") {
		event.waitUntil(tracking);
	}
}
