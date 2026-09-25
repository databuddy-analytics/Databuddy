import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_CLASSIFICATION,
	AI_AGENTS,
	isDnsMaskMatch,
	matchAiAgent,
	parseIpRanges,
} from "../ai-agents";
import { detectBot } from "../detector";
import wellKnownBots from "../well-known-bots.json";

describe("vendored well-known-bots drift", () => {
	it("classifies every upstream bot tagged ai", () => {
		const unclassified = wellKnownBots
			.filter((bot) => bot.categories.includes("ai"))
			.map((bot) => bot.id)
			.filter((id) => !(id in AI_AGENT_CLASSIFICATION));
		expect(unclassified).toEqual([]);
	});

	it("only classifies bots that exist upstream", () => {
		const upstreamIds = new Set(wellKnownBots.map((bot) => bot.id));
		const stale = Object.keys(AI_AGENT_CLASSIFICATION).filter(
			(id) => !upstreamIds.has(id)
		);
		expect(stale).toEqual([]);
	});

	it("reads every IP range source an agent publishes", () => {
		const unread = AI_AGENTS.filter((agent) => {
			const upstream = wellKnownBots.find((bot) => bot.id === agent.id);
			const sourceCount = (upstream?.verification ?? []).reduce(
				(count, v) => count + (v.sources?.length ?? 0),
				0
			);
			const upstreamSources = agent.ipRangeSources.filter(
				(source) => source.format !== "asn"
			);
			return upstreamSources.length !== sourceCount;
		}).map((agent) => agent.id);
		expect(unread).toEqual([]);
	});
});

describe("matchAiAgent", () => {
	it.each(
		AI_AGENTS.map((agent) => [
			agent.id,
			wellKnownBots.find((bot) => bot.id === agent.id)?.instances,
		])
	)("matches %s upstream instances", (id, instances) => {
		for (const ua of instances?.accepted ?? []) {
			expect(matchAiAgent(ua)?.id).toBe(id);
			expect(detectBot(ua).agent?.id).toBe(id);
		}
		for (const ua of instances?.rejected ?? []) {
			expect(matchAiAgent(ua)?.id).not.toBe(id);
		}
	});

	it("ignores human browsers", () => {
		expect(
			matchAiAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
			)
		).toBeNull();
	});
});

describe("parseIpRanges", () => {
	it("reads both address families from prefix JSON", () => {
		const body = JSON.stringify({
			creationTime: "2026-09-22T02:00:07",
			prefixes: [
				{ ipv4Prefix: "20.171.206.0/24" },
				{ ipv6Prefix: "2a03::/32" },
			],
		});
		expect(parseIpRanges("json", body)).toEqual([
			"20.171.206.0/24",
			"2a03::/32",
		]);
	});

	it("reads announced prefixes for an ASN", () => {
		const body = JSON.stringify({
			status: "ok",
			data: {
				prefixes: [{ prefix: "31.13.24.0/21" }, { prefix: "2a03:2880::/32" }],
			},
		});
		expect(parseIpRanges("asn", body)).toEqual([
			"31.13.24.0/21",
			"2a03:2880::/32",
		]);
	});

	it("returns nothing for JSON without prefixes", () => {
		expect(parseIpRanges("json", "{}")).toEqual([]);
	});

	it("reads the first CSV column and skips comments", () => {
		const body =
			"# geofeed\n31.13.24.0/21,IE,IE-D,Dublin,\n\n2a03:2880::/32,US,,,\n";
		expect(parseIpRanges("csv", body)).toEqual([
			"31.13.24.0/21",
			"2a03:2880::/32",
		]);
	});
});

describe("isDnsMaskMatch", () => {
	it.each([
		[
			"crawl-***-***-***-***.googlebot.com",
			"crawl-66-249-66-1.googlebot.com.",
			true,
		],
		[
			"crawl-***-***-***-***.googlebot.com",
			"crawl-66-249-66-1.googlebot.com.evil.io",
			false,
		],
		[
			"crawl-***-***-***-***.googlebot.com",
			"crawl-6666-249-66-1.googlebot.com",
			false,
		],
		["@.crawl.commoncrawl.org", "ec2-1-2-3-4.crawl.commoncrawl.org", true],
		["@.crawl.commoncrawl.org", "crawl.commoncrawl.org.attacker.net", false],
	])("%s against %s is %p", (mask, hostname, expected) => {
		expect(isDnsMaskMatch(mask, hostname)).toBe(expected);
	});
});
