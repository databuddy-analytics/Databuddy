/**
 * Bot Detector Tests
 */

import { describe, expect, it } from "bun:test";
import { detectBot } from "../detector";
import { BotAction, BotCategory } from "../types";

describe("BotDetectorService", () => {
	describe("AI Crawlers", () => {
		it("should detect GPTBot", () => {
			const ua =
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_CRAWLER);
			expect(result.action).toBe(BotAction.TRACK_ONLY);
			expect(result.name).toBe("GPTBot");
		});

		it("should detect ClaudeBot", () => {
			const ua =
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +https://www.anthropic.com/";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_CRAWLER);
			expect(result.action).toBe(BotAction.TRACK_ONLY);
		});

		it("should detect Google-Extended", () => {
			const ua = "Mozilla/5.0 (compatible; Google-Extended)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_CRAWLER);
		});

		it("should detect PerplexityBot", () => {
			const ua =
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_CRAWLER);
		});
	});

	describe("AI Assistants", () => {
		it("should detect ChatGPT-User", () => {
			const ua =
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_ASSISTANT);
			expect(result.action).toBe(BotAction.TRACK_ONLY);
		});

		it("should detect Claude-User", () => {
			const ua =
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.AI_ASSISTANT);
		});
	});

	describe("Search Engines", () => {
		it("should detect Googlebot", () => {
			const ua =
				"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SEARCH_ENGINE);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should detect Bingbot", () => {
			const ua =
				"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SEARCH_ENGINE);
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});

	describe("Social Media", () => {
		it("should detect FacebookBot", () => {
			const ua =
				"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SOCIAL_MEDIA);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should detect Twitterbot", () => {
			const ua = "Twitterbot/1.0";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SOCIAL_MEDIA);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should detect LinkedInBot", () => {
			const ua = "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SOCIAL_MEDIA);
		});
	});

	describe("SEO Tools", () => {
		it("should detect AhrefsBot", () => {
			const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SEO_TOOL);
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("should detect SemrushBot", () => {
			const ua = "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SEO_TOOL);
		});
	});

	describe("Scrapers", () => {
		it("should detect curl", () => {
			const ua = "curl/7.64.1";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SCRAPER);
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("should detect python-requests", () => {
			const ua = "python-requests/2.28.1";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SCRAPER);
			expect(result.action).toBe(BotAction.BLOCK);
		});

		it("should detect puppeteer", () => {
			const ua =
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/91.0.4472.114 Safari/537.36 Puppeteer";
			const result = detectBot(ua);

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.SCRAPER);
		});
	});

	describe("Configuration", () => {
		it("should respect allowlist", () => {
			const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0)";
			const result = detectBot(ua, {
				allowedBots: ["AhrefsBot"],
			});

			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.ALLOW);
			expect(result.reason).toBe("explicit_allowlist");
		});

		it("should respect blocklist", () => {
			const ua = "Googlebot/2.1";
			const result = detectBot(ua, {
				blockedBots: ["Googlebot"],
			});

			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.BLOCK);
			expect(result.reason).toBe("explicit_blocklist");
		});

		it("should allow AI crawlers when configured", () => {
			const ua = "GPTBot/1.0";
			const result = detectBot(ua, {
				allowAICrawlers: true,
				trackOnlyCategories: [],
			});

			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should block search engines when configured", () => {
			const ua = "Googlebot/2.1";
			const result = detectBot(ua, {
				allowSearchEngines: false,
			});

			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.BLOCK);
		});
	});

	describe("Missing User Agent", () => {
		it("should detect missing user agent", () => {
			const result = detectBot("");

			expect(result.isBot).toBe(true);
			expect(result.category).toBe(BotCategory.UNKNOWN_BOT);
			expect(result.reason).toBe("missing_user_agent");
		});

		it("should allow missing user agent when configured", () => {
			const result = detectBot("", {
				blockMissingUserAgent: false,
			});

			expect(result.isBot).toBe(true);
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});

	describe("Human Traffic", () => {
		it("should not detect Chrome as bot", () => {
			const ua =
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
			const result = detectBot(ua);

			expect(result.isBot).toBe(false);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should not detect Safari as bot", () => {
			const ua =
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
			const result = detectBot(ua);

			expect(result.isBot).toBe(false);
			expect(result.action).toBe(BotAction.ALLOW);
		});

		it("should not detect Firefox as bot", () => {
			const ua =
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
			const result = detectBot(ua);

			expect(result.isBot).toBe(false);
			expect(result.action).toBe(BotAction.ALLOW);
		});
	});
});
