import { describe, expect, it } from "bun:test";
import { detectBot } from "../detector";
import { BotAction, BotCategory } from "../types";
import { extractBotName, matchCategory, parseUserAgent } from "../user-agent";

function expectBot(
	ua: string,
	category: BotCategory,
	action?: BotAction,
	name?: string
) {
	const result = detectBot(ua);
	expect(result.isBot).toBe(true);
	expect(result.category).toBe(category);
	if (action) {
		expect(result.action).toBe(action);
	}
	if (name) {
		expect(result.name).toBe(name);
	}
	return result;
}

function expectHuman(ua: string) {
	const result = detectBot(ua);
	expect(result.isBot).toBe(false);
	expect(result.action).toBe(BotAction.ALLOW);
	expect(result.reason).toBe("human");
	return result;
}

describe("detectBot", () => {
	describe("AI Crawlers — every major provider", () => {
		const crawlers: [string, string][] = [
			["OpenAI GPTBot", "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"],
			["OpenAI SearchBot", "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)"],
			["Anthropic ClaudeBot", "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"],
			["Anthropic Claude-Web", "Mozilla/5.0 (compatible; Claude-Web/1.0)"],
			["Anthropic Claude-SearchBot", "Mozilla/5.0 (compatible; Claude-SearchBot/1.0)"],
			["Google-Extended", "Mozilla/5.0 (compatible; Google-Extended)"],
			["GoogleOther", "GoogleOther"],
			["Google-CloudVertexBot", "Google-CloudVertexBot"],
			["Meta ExternalAgent", "meta-externalagent/1.0"],
			["FacebookBot", "FacebookBot/1.0"],
			["PerplexityBot", "PerplexityBot/1.0"],
			["xAI-Bot", "xAI-Bot/1.0"],
			["Amazonbot", "Amazonbot/0.1"],
			["Applebot", "Applebot/0.1"],
			["DeepSeekBot", "DeepSeekBot/1.0"],
			["Bytespider", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"],
			["TikTokSpider", "TikTokSpider"],
			["Bravebot", "Bravebot"],
			["YouBot", "YouBot/1.0"],
			["v0bot", "v0bot"],
			["HuggingFace-Bot", "HuggingFace-Bot"],
			["CCBot", "CCBot/2.0"],
			["Diffbot", "Diffbot/0.1"],
			["NotebookLM", "NotebookLM/1.0"],
			["ChatGLM-Spider", "ChatGLM-Spider"],
			["Together-Bot", "Together-Bot"],
			["Replicate-Bot", "Replicate-Bot"],
			["FirecrawlAgent", "FirecrawlAgent"],
			["Cohere crawler", "cohere-training-data-crawler"],
			["Cloudflare-AI-Search", "Cloudflare-AI-Search/1.0"],
			["SBIntuitionsBot", "SBIntuitionsBot/1.0"],
		];

		for (const [label, ua] of crawlers) {
			it(`should detect ${label}`, () => {
				expectBot(ua, BotCategory.AI_CRAWLER, BotAction.TRACK_ONLY);
			});
		}
	});

	describe("AI Assistants", () => {
		const assistants: [string, string][] = [
			["ChatGPT-User", "ChatGPT-User/1.0"],
			["Claude-User", "Mozilla/5.0 (compatible; Claude-User/1.0)"],
			["MistralAI-User", "MistralAI-User/1.0"],
			["DuckAssistBot", "DuckAssistBot/1.1"],
			["Devin", "Devin/1.0"],
			["Google-Agent", "Google-Agent"],
			["Gemini-Deep-Research", "Gemini-Deep-Research"],
			["NovaAct", "NovaAct/1.0"],
			["Perplexity-User", "Perplexity-User/1.0"],
			["Cohere-AI", "Cohere-AI/1.0"],
			["Meta ExternalFetcher", "meta-externalfetcher/1.0"],
		];

		for (const [label, ua] of assistants) {
			it(`should detect ${label}`, () => {
				expectBot(ua, BotCategory.AI_ASSISTANT, BotAction.TRACK_ONLY);
			});
		}
	});

	describe("Search Engines", () => {
		it.each([
			["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
			["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
			["YandexBot", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"],
			["DuckDuckBot", "DuckDuckBot/1.0"],
			["Baiduspider", "Mozilla/5.0 (compatible; Baiduspider/2.0)"],
		])("should detect %s", (_label, ua) => {
			expectBot(ua, BotCategory.SEARCH_ENGINE, BotAction.ALLOW);
		});
	});

	describe("Social Media", () => {
		it.each([
			["facebookexternalhit", "facebookexternalhit/1.1"],
			["Twitterbot", "Twitterbot/1.0"],
			["LinkedInBot", "LinkedInBot/1.0"],
			["Slackbot", "Slackbot-LinkExpanding 1.0"],
			["Discordbot", "Mozilla/5.0 (compatible; Discordbot/2.0)"],
			["WhatsApp", "WhatsApp/2.23"],
			["Telegrambot", "TelegramBot (like TwitterBot)"],
		])("should detect %s", (_label, ua) => {
			expectBot(ua, BotCategory.SOCIAL_MEDIA, BotAction.ALLOW);
		});
	});

	describe("SEO Tools", () => {
		it.each([
			["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
			["SemrushBot", "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)"],
			["MJ12bot", "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)"],
			["DotBot", "Mozilla/5.0 (compatible; DotBot/1.2)"],
		])("should detect %s", (_label, ua) => {
			expectBot(ua, BotCategory.SEO_TOOL, BotAction.BLOCK);
		});
	});

	describe("Monitoring", () => {
		it.each([
			["UptimeRobot", "Mozilla/5.0 (compatible; UptimeRobot/2.0)"],
			["Pingdom", "Pingdom.com_bot_version_1.4"],
			["Datadog", "Datadog/Synthetics"],
			["Site24x7", "Site24x7"],
		])("should detect %s", (_label, ua) => {
			expectBot(ua, BotCategory.MONITORING, BotAction.ALLOW);
		});
	});

	describe("Scrapers", () => {
		it.each([
			["curl", "curl/7.64.1"],
			["wget", "Wget/1.21"],
			["python-requests", "python-requests/2.28.1"],
			["Puppeteer", "Mozilla/5.0 HeadlessChrome/91.0 Safari/537.36 Puppeteer"],
			["Playwright", "Mozilla/5.0 (compatible; Playwright/1.0)"],
			["Scrapy", "Scrapy/2.5"],
		])("should detect %s", (_label, ua) => {
			expectBot(ua, BotCategory.SCRAPER, BotAction.BLOCK);
		});
	});

	describe("Regex patterns (from UA2.json)", () => {
		it.each([
			["Googlebot with slash", "Googlebot/2.1 (+http://www.google.com/bot.html)"],
			["AdsBot-Google", "AdsBot-Google (+http://www.google.com/adsbot.html)"],
			["Facebot regex", "Facebot/1.0"],
			["BingPreview", "BingPreview/1.0b"],
			["Stripe webhook", "Stripe/1.0 (+https://stripe.com)"],
		])("should detect %s via regex", (_label, ua) => {
			const result = detectBot(ua);
			expect(result.isBot).toBe(true);
		});
	});

	describe("Human traffic — no false positives", () => {
		it.each([
			["Chrome Desktop", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
			["Chrome Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36"],
			["Safari macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"],
			["Safari iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"],
			["Firefox Desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"],
			["Firefox Android", "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0"],
			["Edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91"],
			["Opera", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0"],
			["Samsung Internet", "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"],
			["Brave Browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
			["Arc Browser", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"],
			["Vivaldi", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5"],
			["iPad Safari", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"],
		])("should NOT detect %s as bot", (_label, ua) => {
			expectHuman(ua);
		});
	});

	describe("Missing / empty user agent", () => {
		it("should detect empty string", () => {
			const result = detectBot("");
			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.UNKNOWN_BOT);
			expect(result.action).toBe(BotAction.BLOCK);
			expect(result.reason).toBe("missing_user_agent");
		});

		it("should allow empty when configured", () => {
			const result = detectBot("", { blockMissingUserAgent: false });
			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});

	describe("Configuration overrides", () => {
		it("allowlist overrides category action", () => {
			const result = detectBot("AhrefsBot/7.0", { allowedBots: ["AhrefsBot"] });
			expect(result.action).toBe(BotAction.ALLOW);
			expect(result.reason).toBe("explicit_allowlist");
		});

		it("blocklist overrides category action", () => {
			const result = detectBot("Googlebot/2.1", { blockedBots: ["Googlebot"] });
			expect(result.action).toBe(BotAction.BLOCK);
			expect(result.reason).toBe("explicit_blocklist");
		});

		it("allowAICrawlers changes AI action to ALLOW", () => {
			const result = detectBot("GPTBot/1.0", {
				allowAICrawlers: true,
				trackOnlyCategories: [],
			});
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("allowSearchEngines=false blocks search bots", () => {
			const result = detectBot("Googlebot/2.1", { allowSearchEngines: false });
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("allowSocialMedia=false blocks social bots", () => {
			const result = detectBot("Twitterbot/1.0", { allowSocialMedia: false });
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("allowMonitoring=false blocks monitoring bots", () => {
			const result = detectBot("UptimeRobot/2.0", { allowMonitoring: false });
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("allowSEOTools=true allows SEO bots", () => {
			const result = detectBot("AhrefsBot/7.0", { allowSEOTools: true });
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});

	describe("Caching", () => {
		it("returns same result for repeated calls", () => {
			const ua = "Mozilla/5.0 (compatible; GPTBot/1.0)";
			const first = detectBot(ua);
			const second = detectBot(ua);
			expect(first).toBe(second);
		});

		it("custom config bypasses cache", () => {
			const ua = "Googlebot/2.1";
			const cached = detectBot(ua);
			const custom = detectBot(ua, { allowSearchEngines: false });
			expect(cached.action).toBe(BotAction.ALLOW);
			expect(custom.action).toBe(BotAction.BLOCK);
		});
	});
});

describe("matchCategory", () => {
	it("returns pattern category for known bot", () => {
		expect(matchCategory("GPTBot/1.0")).toBe("AI_CRAWLER");
	});

	it("returns null for human UA", () => {
		expect(
			matchCategory(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0"
			)
		).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(matchCategory("")).toBeNull();
	});

	it("matches regex patterns", () => {
		expect(matchCategory("Facebot/1.0")).not.toBeNull();
	});
});

describe("extractBotName", () => {
	it("finds name from pattern database", () => {
		expect(extractBotName("GPTBot/1.0")).toBe("GPTBot");
	});

	it("falls back to ua-parser-js", () => {
		const name = extractBotName("Googlebot/2.1");
		expect(name).toBeDefined();
	});

	it("returns browser name for human UA via ua-parser-js", () => {
		const name = extractBotName(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		);
		expect(name).toBe("Chrome");
	});

	it("returns undefined for empty string", () => {
		expect(extractBotName("")).toBeUndefined();
	});
});

describe("parseUserAgent", () => {
	it("parses Chrome UA", () => {
		const result = parseUserAgent(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		);
		expect(result.browserName).toBe("Chrome");
		expect(result.osName).toBe("macOS");
	});

	it("parses mobile UA", () => {
		const result = parseUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
		);
		expect(result.browserName).toBe("Mobile Safari");
		expect(result.osName).toBe("iOS");
	});

	it("returns raw for empty string", () => {
		const result = parseUserAgent("");
		expect(result.raw).toBe("");
	});
});

describe("Performance", () => {
	const ITERATIONS = 10_000;

	const botUAs = [
		"Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
		"Mozilla/5.0 (compatible; ClaudeBot/1.0)",
		"Mozilla/5.0 (compatible; Googlebot/2.1)",
		"facebookexternalhit/1.1",
		"Mozilla/5.0 (compatible; AhrefsBot/7.0)",
		"curl/7.64.1",
		"UptimeRobot/2.0",
	];

	const humanUAs = [
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
	];

	it(`should process ${ITERATIONS} bot UAs in < 500ms (cold)`, () => {
		const start = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			detectBot(botUAs[i % botUAs.length] + i, { blockMissingUserAgent: true });
		}
		const elapsed = performance.now() - start;
		console.log(`  Bot detection (cold): ${ITERATIONS} calls in ${elapsed.toFixed(1)}ms (${(elapsed / ITERATIONS * 1000).toFixed(1)}µs/call)`);
		expect(elapsed).toBeLessThan(500);
	});

	it(`should process ${ITERATIONS} bot UAs in < 50ms (cached)`, () => {
		for (const ua of botUAs) {
			detectBot(ua);
		}
		const start = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			detectBot(botUAs[i % botUAs.length]);
		}
		const elapsed = performance.now() - start;
		console.log(`  Bot detection (cached): ${ITERATIONS} calls in ${elapsed.toFixed(1)}ms (${(elapsed / ITERATIONS * 1000).toFixed(1)}µs/call)`);
		expect(elapsed).toBeLessThan(50);
	});

	it(`should process ${ITERATIONS} human UAs in < 2000ms (cold)`, () => {
		const start = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			detectBot(humanUAs[i % humanUAs.length] + i, { blockMissingUserAgent: true });
		}
		const elapsed = performance.now() - start;
		console.log(`  Human detection (cold): ${ITERATIONS} calls in ${elapsed.toFixed(1)}ms (${(elapsed / ITERATIONS * 1000).toFixed(1)}µs/call)`);
		expect(elapsed).toBeLessThan(2000);
	});
});
