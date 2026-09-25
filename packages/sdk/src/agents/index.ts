export interface AgentTrafficOptions {
	apiKey: string;
	apiUrl?: string;
	timeoutMs?: number;
	websiteId: string;
}

export const AI_AGENT_USER_AGENT =
	/GoogleOther|AISearchBot|CCBot|Applebot|omgili|ICC-Crawler|Diffbot\/|VelenPublicWebCrawler|Bytespider|Amazonbot|PetalBot|GPTBot|ChatGPT-User|YouBot|ImagesiftBot|PerplexityBot\/|[cC]laude(?:[bB]ot|-[Ww]eb)|Claude-User|Claude-SearchBot|AI2Bot\s|Ai2Bot-Dolma|FriendlyCrawler|Google-CloudVertexBot|[Mm]eta-[Ee]xternal[Aa]gent|meta-externalfetcher|OAI-SearchBot|Timpibot|webzio-extended|cohere-ai|iaskspider|img2dataset|TikTokSpider|Perplexity-?User|SBIntuitionsBot\/|Google-(?:GeminiNotebook|NotebookLM)|Google-Agent|Gemini-Deep-Research|anthropic-ai|MistralAI-User|MistralAI-Index|MistralAI-Training|DuckAssistBot|FirecrawlAgent|Cloudflare-(?:AI-Search|AutoRAG)|TavilyBot|ShapBot|ZanistaBot|kagi-fetcher|Brightbot|atlassian-bot|AzureAI-SearchBot|Amzn-SearchBot|Amzn-User|Amazon-Bedrock-AgentCore-Browser|Anomura\/|ApifyBot|Channel3Bot|imageSpider|laion-huggingface-processor|LinkupBot|PhindBot|Flyriverbot|crawl4ai|Mozilla-Tabstack|ExaSearchBot|KimiBot|Kimi-User|Kimi-SearchBot|Crawlspace/;

const ASSET_PATH =
	/^\/_next\/|\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip)$/i;
const DEFAULT_API_URL = "https://basket.databuddy.cc";
const DEFAULT_TIMEOUT_MS = 3000;

function getClientIp(headers: Headers): string {
	return (
		headers.get("cf-connecting-ip") ??
		headers.get("x-real-ip") ??
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		""
	);
}

export async function trackAgentTraffic(
	request: Request,
	options: AgentTrafficOptions
): Promise<void> {
	const userAgent = request.headers.get("user-agent") ?? "";
	const { pathname } = new URL(request.url);
	if (
		!(
			(request.method === "GET" || request.method === "HEAD") &&
			AI_AGENT_USER_AGENT.test(userAgent)
		) ||
		ASSET_PATH.test(pathname)
	) {
		return;
	}
	await fetch(`${options.apiUrl ?? DEFAULT_API_URL}/ai-traffic`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${options.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			websiteId: options.websiteId,
			path: pathname,
			userAgent,
			ip: getClientIp(request.headers),
			referrer: request.headers.get("referer") ?? undefined,
		}),
		signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
	}).catch(() => undefined);
}
