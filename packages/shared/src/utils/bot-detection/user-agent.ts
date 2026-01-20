/**
 * User Agent Parsing Utilities
 * 
 * Provides user agent parsing and bot name extraction
 */

import { UAParser } from "ua-parser-js";
import type { ParsedUserAgent } from "./types";

/**
 * Parse user agent string into structured information
 */
export function parseUserAgent(userAgent: string): ParsedUserAgent {
	if (!userAgent) {
		return { raw: "" };
	}

	try {
		const parser = new UAParser(userAgent);
		const result = parser.getResult();

		return {
			browserName: result.browser.name || undefined,
			browserVersion: result.browser.version || undefined,
			osName: result.os.name || undefined,
			osVersion: result.os.version || undefined,
			deviceType: result.device.type || undefined,
			deviceBrand: result.device.vendor || undefined,
			deviceModel: result.device.model || undefined,
			raw: userAgent,
		};
	} catch {
		return { raw: userAgent };
	}
}

/**
 * Extract bot name from user agent string
 */
export function extractBotName(userAgent: string): string | undefined {
	if (!userAgent) {
		return undefined;
	}

	try {
		const parser = new UAParser(userAgent);
		const browserName = parser.getBrowser().name;
		return browserName || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Check if user agent matches search engine patterns
 */
export function isSearchEngineBot(userAgent: string): boolean {
	if (!userAgent) {
		return false;
	}

	const searchEngines = [
		"googlebot",
		"bingbot",
		"yahoo! slurp",
		"duckduckbot",
		"baiduspider",
		"yandexbot",
		"sogou",
		"exabot",
	];

	const lower = userAgent.toLowerCase();
	return searchEngines.some((engine) => lower.includes(engine));
}

/**
 * Check if user agent matches social media bot patterns
 */
export function isSocialMediaBot(userAgent: string): boolean {
	if (!userAgent) {
		return false;
	}

	const socialBots = [
		"facebookexternalhit",
		"facebookbot",
		"twitterbot",
		"linkedinbot",
		"pinterestbot",
		"slackbot",
		"discordbot",
		"whatsapp",
		"telegrambot",
		"meta-externalagent",
		"meta-externalfetcher",
	];

	const lower = userAgent.toLowerCase();
	return socialBots.some((bot) => lower.includes(bot));
}

/**
 * Check if user agent matches SEO tool patterns
 */
export function isSEOTool(userAgent: string): boolean {
	if (!userAgent) {
		return false;
	}

	const seoTools = [
		"ahrefsbot",
		"semrushbot",
		"mj12bot",
		"dotbot",
		"screaming frog",
		"spbot",
		"blexbot",
	];

	const lower = userAgent.toLowerCase();
	return seoTools.some((tool) => lower.includes(tool));
}

/**
 * Check if user agent matches monitoring service patterns
 */
export function isMonitoringBot(userAgent: string): boolean {
	if (!userAgent) {
		return false;
	}

	const monitoringBots = [
		"pingdom",
		"uptimerobot",
		"statuscake",
		"better uptime bot",
		"nodeping",
		"site24x7",
		"blackbox exporter",
		"datadog",
		"newrelic",
	];

	const lower = userAgent.toLowerCase();
	return monitoringBots.some((bot) => lower.includes(bot));
}

/**
 * Check if user agent matches generic scraper patterns
 */
export function isScraperBot(userAgent: string): boolean {
	if (!userAgent) {
		return false;
	}

	const scraperPatterns = [
		"scrapy",
		"curl",
		"wget",
		"python-requests",
		"python-urllib",
		"go-http-client",
		"axios",
		"node-fetch",
		"okhttp",
		"apache-httpclient",
		"headlesschrome",
		"phantomjs",
		"selenium",
		"puppeteer",
		"playwright",
	];

	const lower = userAgent.toLowerCase();
	return scraperPatterns.some((pattern) => lower.includes(pattern));
}
