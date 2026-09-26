export interface TrackAgentsOptions {
	apiUrl?: string;
	timeoutMs?: number;
	websiteId?: string;
}

interface NodeRequest {
	headers: Record<string, string | string[] | undefined>;
	method?: string;
	url?: string;
}

export const AI_AGENT_USER_AGENT =
	/Claude-User \(claude-code\/|Google-Gemini-CLI\/|Aider\/[\d.]+ \+https:\/\/aider\.chat|^Zed\/[\d.]+ \(|^opencode$|\bDevin\/\d|\bv0bot\b|Manus-User|GoogleOther|AISearchBot|CCBot|Applebot|omgili|ICC-Crawler|Diffbot\/|VelenPublicWebCrawler|Bytespider|Amazonbot|PetalBot|GPTBot|ChatGPT-User|YouBot|ImagesiftBot|PerplexityBot\/|[cC]laude(?:[bB]ot|-[Ww]eb)|Claude-User|Claude-SearchBot|AI2Bot\s|Ai2Bot-Dolma|FriendlyCrawler|Google-CloudVertexBot|[Mm]eta-[Ee]xternal[Aa]gent|meta-externalfetcher|OAI-SearchBot|Timpibot|webzio-extended|cohere-ai|iaskspider|img2dataset|TikTokSpider|Perplexity-?User|SBIntuitionsBot\/|Google-(?:GeminiNotebook|NotebookLM)|Google-Agent|Gemini-Deep-Research|anthropic-ai|MistralAI-User|MistralAI-Index|MistralAI-Training|DuckAssistBot|FirecrawlAgent|Cloudflare-(?:AI-Search|AutoRAG)|TavilyBot|ShapBot|ZanistaBot|kagi-fetcher|Brightbot|atlassian-bot|AzureAI-SearchBot|Amzn-SearchBot|Amzn-User|Amazon-Bedrock-AgentCore-Browser|Anomura\/|ApifyBot|Channel3Bot|imageSpider|laion-huggingface-processor|LinkupBot|PhindBot|Flyriverbot|crawl4ai|Mozilla-Tabstack|ExaSearchBot|KimiBot|Kimi-User|Kimi-SearchBot|Crawlspace/;

const ASSET_PATH =
	/^\/_next\/|\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip)$/i;
const LLMS_TXT_PATH = /\/llms(-full)?\.txt$/i;
const MARKDOWN_PATH = /\.mdx?$/i;
const DEFAULT_API_URL = "https://basket.databuddy.cc";
const DEFAULT_TIMEOUT_MS = 3000;

function env(name: string): string | undefined {
	return typeof process === "undefined" ? undefined : process.env[name];
}

function header(request: Request | NodeRequest, name: string): string {
	if (request instanceof Request) {
		return request.headers.get(name) ?? "";
	}
	const value = request.headers[name];
	return (Array.isArray(value) ? value[0] : value) ?? "";
}

function contentFormat(
	pathname: string,
	accept: string
): "llms" | "markdown" | "html" {
	if (LLMS_TXT_PATH.test(pathname)) {
		return "llms";
	}
	return MARKDOWN_PATH.test(pathname) || accept.includes("text/markdown")
		? "markdown"
		: "html";
}

export async function trackAgents(
	request: Request | NodeRequest,
	options: TrackAgentsOptions = {}
): Promise<void> {
	const websiteId =
		options.websiteId ??
		env("DATABUDDY_WEBSITE_ID") ??
		env("NEXT_PUBLIC_DATABUDDY_CLIENT_ID");
	const method = request.method ?? "GET";
	const userAgent = header(request, "user-agent");
	const { host, pathname } = new URL(
		request.url ?? "/",
		`http://${header(request, "host") || "localhost"}`
	);
	if (
		!(
			websiteId &&
			(method === "GET" || method === "HEAD") &&
			AI_AGENT_USER_AGENT.test(userAgent)
		) ||
		ASSET_PATH.test(pathname)
	) {
		return;
	}
	await fetch(`${options.apiUrl ?? DEFAULT_API_URL}/ai-traffic`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			websiteId,
			host,
			path: pathname,
			format: contentFormat(pathname, header(request, "accept")),
			userAgent,
			referrer: header(request, "referer") || undefined,
		}),
		signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
	}).catch(() => undefined);
}

export function proxy(
	request: Request,
	event: { waitUntil(promise: Promise<unknown>): void }
): void {
	event.waitUntil(trackAgents(request));
}
