import { describe, expect, it } from "bun:test";
import { detectBot } from "../detector";
import { BotAction, BotCategory } from "../types";
import { extractBotName, matchCategory, parseUserAgent } from "../user-agent";

function expectBot(ua: string, category: BotCategory, action: BotAction) {
	const result = detectBot(ua);
	expect(result.isBot).toBe(true);
	expect(result.category).toBe(category);
	expect(result.action).toBe(action);
	return result;
}

describe("detectBot", () => {
	describe("AI crawlers — every major provider", () => {
		it.each([
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
		])("detects %s as track-only AI crawler", (_label, ua) => {
			expectBot(ua, BotCategory.AI_CRAWLER, BotAction.TRACK_ONLY);
		});
	});

	describe("AI assistants", () => {
		it.each([
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
		])("detects %s as track-only AI assistant", (_label, ua) => {
			expectBot(ua, BotCategory.AI_ASSISTANT, BotAction.TRACK_ONLY);
		});
	});

	describe("search engines", () => {
		it.each([
			["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
			["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
			["YandexBot", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"],
			["DuckDuckBot", "DuckDuckBot/1.0"],
			["Baiduspider", "Mozilla/5.0 (compatible; Baiduspider/2.0)"],
		])("allows %s", (_label, ua) => {
			expectBot(ua, BotCategory.SEARCH_ENGINE, BotAction.ALLOW);
		});
	});

	describe("social media", () => {
		it.each([
			["facebookexternalhit", "facebookexternalhit/1.1"],
			["Twitterbot", "Twitterbot/1.0"],
			["LinkedInBot", "LinkedInBot/1.0"],
			["Slackbot", "Slackbot-LinkExpanding 1.0"],
			["Discordbot", "Mozilla/5.0 (compatible; Discordbot/2.0)"],
			["WhatsApp", "WhatsApp/2.23"],
			["Telegrambot", "TelegramBot (like TwitterBot)"],
		])("allows %s", (_label, ua) => {
			expectBot(ua, BotCategory.SOCIAL_MEDIA, BotAction.ALLOW);
		});
	});

	describe("SEO tools", () => {
		it.each([
			["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
			["SemrushBot", "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)"],
			["MJ12bot", "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)"],
			["DotBot", "Mozilla/5.0 (compatible; DotBot/1.2)"],
		])("blocks %s", (_label, ua) => {
			expectBot(ua, BotCategory.SEO_TOOL, BotAction.BLOCK);
		});
	});

	describe("monitoring", () => {
		it.each([
			["UptimeRobot", "Mozilla/5.0 (compatible; UptimeRobot/2.0)"],
			["Pingdom", "Pingdom.com_bot_version_1.4"],
			["Datadog", "Datadog/Synthetics"],
			["Site24x7", "Site24x7"],
		])("allows %s", (_label, ua) => {
			expectBot(ua, BotCategory.MONITORING, BotAction.ALLOW);
		});
	});

	describe("scrapers", () => {
		it.each([
			["curl", "curl/7.64.1"],
			["wget", "Wget/1.21"],
			["python-requests", "python-requests/2.28.1"],
			["Puppeteer", "Mozilla/5.0 HeadlessChrome/91.0 Safari/537.36 Puppeteer"],
			["Playwright", "Mozilla/5.0 (compatible; Playwright/1.0)"],
			["Scrapy", "Scrapy/2.5"],
		])("blocks %s", (_label, ua) => {
			expectBot(ua, BotCategory.SCRAPER, BotAction.BLOCK);
		});
	});

	describe("regex patterns (from UA2.json)", () => {
		it.each([
			["Googlebot with slash", "Googlebot/2.1 (+http://www.google.com/bot.html)"],
			["AdsBot-Google", "AdsBot-Google (+http://www.google.com/adsbot.html)"],
			["Facebot regex", "Facebot/1.0"],
			["BingPreview", "BingPreview/1.0b"],
			["Stripe webhook", "Stripe/1.0 (+https://stripe.com)"],
		])("detects %s via regex", (_label, ua) => {
			expect(detectBot(ua).isBot).toBe(true);
		});
	});

	describe("human traffic — no false positives", () => {
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
		])("does not flag %s as a bot", (_label, ua) => {
			const result = detectBot(ua);
			expect(result.isBot).toBe(false);
			expect(result.action).toBe(BotAction.ALLOW);
			expect(result.reason).toBe("human");
		});
	});

	describe("missing user agent", () => {
		it("blocks an empty user agent by default", () => {
			expect(detectBot("")).toMatchObject({
				isBot: true,
				category: BotCategory.UNKNOWN_BOT,
				action: BotAction.BLOCK,
				reason: "missing_user_agent",
			});
		});

		it("allows an empty user agent when configured", () => {
			const result = detectBot("", { blockMissingUserAgent: false });
			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});

	describe("configuration overrides", () => {
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

	describe("caching", () => {
		it("returns the same result instance for repeated default-config calls", () => {
			const ua = "Mozilla/5.0 (compatible; GPTBot/1.0)";
			expect(detectBot(ua)).toBe(detectBot(ua));
		});

		it("custom config bypasses the cache", () => {
			const ua = "Googlebot/2.1";
			expect(detectBot(ua).action).toBe(BotAction.ALLOW);
			expect(detectBot(ua, { allowSearchEngines: false }).action).toBe(
				BotAction.BLOCK
			);
		});
	});

	describe("generic isBot() fallback", () => {
		it("respects trackOnlyCategories for bots only caught by ua-parser-js's generic isBot()", () => {
			const result = detectBot("PowerShell/7.1.0", {
				trackOnlyCategories: [BotCategory.UNKNOWN_BOT],
			});

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.UNKNOWN_BOT);
			expect(result.reason).toBe("general_bot_pattern");
			expect(result.action).toBe(BotAction.TRACK_ONLY);
		});
	});
});

describe("matchCategory", () => {
	it("returns pattern category for a known bot", () => {
		expect(matchCategory("GPTBot/1.0")).toBe("AI_CRAWLER");
	});

	it("matches regex patterns", () => {
		expect(matchCategory("Facebot/1.0")).not.toBeNull();
	});

	it.each([
		["human UA", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0"],
		["empty string", ""],
	])("returns null for %s", (_label, ua) => {
		expect(matchCategory(ua)).toBeNull();
	});
});

describe("extractBotName", () => {
	it("finds a name from the pattern database", () => {
		expect(extractBotName("GPTBot/1.0")).toBe("GPTBot");
	});

	it("falls back to ua-parser-js for bots missing from the pattern database", () => {
		expect(extractBotName("Googlebot/2.1")).toBe("GoogleBot");
	});

	it("returns the browser name for a human UA via ua-parser-js", () => {
		expect(
			extractBotName(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
			)
		).toBe("Chrome");
	});

	it("returns undefined for an empty string", () => {
		expect(extractBotName("")).toBeUndefined();
	});
});

describe("parseUserAgent", () => {
	it("parses a desktop Chrome UA", () => {
		const result = parseUserAgent(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
		);
		expect(result.browserName).toBe("Chrome");
		expect(result.osName).toBe("macOS");
	});

	it("parses a mobile UA", () => {
		const result = parseUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
		);
		expect(result.browserName).toBe("Mobile Safari");
		expect(result.osName).toBe("iOS");
	});

	it("returns only the raw value for an empty string", () => {
		expect(parseUserAgent("")).toEqual({ raw: "" });
	});
});
