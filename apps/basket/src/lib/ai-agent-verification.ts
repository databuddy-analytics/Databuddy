import { Resolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { getRedisCache } from "@databuddy/redis/redis";
import {
	AI_AGENTS,
	type IpRangeSource,
	isDnsMaskMatch,
	parseIpRanges,
} from "@databuddy/shared/bot-detection/ai-agents";
import { captureError } from "@lib/tracing";
import { LRUCache } from "lru-cache";
import { z } from "zod";

export type AgentVerification =
	| "ip_verified"
	| "rdns_verified"
	| "ua_only"
	| "spoofed";

type IpFamily = "ipv4" | "ipv6";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const FIRST_LOAD_WAIT_MS = 2000;
const LAST_KNOWN_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;
const IPV4_MAPPED_PREFIX = "::ffff:";

const AGENTS_BY_ID = new Map(AI_AGENTS.map((agent) => [agent.id, agent]));
const IP_RANGE_SOURCES = [
	...new Map(
		AI_AGENTS.flatMap((agent) => agent.ipRangeSources).map((source) => [
			source.url,
			source,
		])
	).values(),
];
const lastKnownGoodSchema = z.array(z.string());
const resolver = new Resolver({ timeout: 1500, tries: 1 });

const ipRangesBySourceUrl = new Map<string, string[]>();
let blockListsByAgentId: Map<string, BlockList> | null = null;
let firstLoad: Promise<void> | null = null;
const verificationCache = new LRUCache<string, AgentVerification>({
	max: 10_000,
	ttl: REFRESH_INTERVAL_MS,
});

function ipFamily(ip: string): IpFamily | null {
	const version = isIP(ip);
	if (version === 4) {
		return "ipv4";
	}
	return version === 6 ? "ipv6" : null;
}

async function refreshIpRanges(source: IpRangeSource): Promise<void> {
	const redisKey = `bot-ranges:${source.url}`;
	try {
		const response = await fetch(source.url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		const ranges = response.ok
			? parseIpRanges(source.format, await response.text())
			: [];
		if (ranges.length > 0) {
			ipRangesBySourceUrl.set(source.url, ranges);
			await getRedisCache().set(
				redisKey,
				JSON.stringify(ranges),
				"EX",
				LAST_KNOWN_GOOD_TTL_SECONDS
			);
			return;
		}
	} catch (error) {
		captureError(error, {
			message: "Failed to refresh AI agent IP ranges",
			url: source.url,
		});
	}
	if (ipRangesBySourceUrl.has(source.url)) {
		return;
	}
	try {
		const cached = await getRedisCache().get(redisKey);
		const lastKnownGood = lastKnownGoodSchema.safeParse(
			JSON.parse(cached ?? "null")
		);
		if (lastKnownGood.success) {
			ipRangesBySourceUrl.set(source.url, lastKnownGood.data);
		}
	} catch (error) {
		captureError(error, {
			message: "Failed to read last known good AI agent IP ranges",
			url: source.url,
		});
	}
}

function toBlockList(ranges: string[]): BlockList | null {
	const list = new BlockList();
	let added = 0;
	for (const range of ranges) {
		const [address = "", prefix] = range.split("/");
		const family = ipFamily(address);
		const maxBits = family === "ipv4" ? 32 : 128;
		const bits = prefix === undefined ? maxBits : Number(prefix);
		if (family && Number.isInteger(bits) && bits >= 0 && bits <= maxBits) {
			list.addSubnet(address, bits, family);
			added++;
		}
	}
	return added > 0 ? list : null;
}

async function refreshAllIpRanges(): Promise<void> {
	await Promise.all(IP_RANGE_SOURCES.map(refreshIpRanges));
	const lists = new Map<string, BlockList>();
	for (const agent of AI_AGENTS) {
		const list = toBlockList([
			...agent.ipRanges,
			...agent.ipRangeSources.flatMap(
				(source) => ipRangesBySourceUrl.get(source.url) ?? []
			),
		]);
		if (list) {
			lists.set(agent.id, list);
		}
	}
	blockListsByAgentId = lists;
	verificationCache.clear();
}

function ensureIpRanges(): Promise<void> {
	if (!firstLoad) {
		firstLoad = refreshAllIpRanges();
		setInterval(() => {
			refreshAllIpRanges().catch((error) =>
				captureError(error, { message: "AI agent IP range refresh failed" })
			);
		}, REFRESH_INTERVAL_MS).unref();
	}
	return firstLoad;
}

async function verifyByReverseDns(
	masks: string[],
	ip: string,
	family: IpFamily
): Promise<AgentVerification | null> {
	try {
		for (const hostname of await resolver.reverse(ip)) {
			if (!masks.some((mask) => isDnsMaskMatch(mask, hostname))) {
				continue;
			}
			const addresses =
				family === "ipv4"
					? await resolver.resolve4(hostname)
					: await resolver.resolve6(hostname);
			const forward = new BlockList();
			for (const address of addresses) {
				forward.addAddress(address, family);
			}
			if (forward.check(ip, family)) {
				return "rdns_verified";
			}
		}
		return "spoofed";
	} catch {
		return null;
	}
}

function unmapIpv4(ip: string): string {
	const mapped = ip.slice(IPV4_MAPPED_PREFIX.length);
	return ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX) && isIP(mapped) === 4
		? mapped
		: ip;
}

export async function verifyAiAgent(
	agentId: string,
	clientIp: string
): Promise<AgentVerification> {
	const agent = AGENTS_BY_ID.get(agentId);
	const ip = unmapIpv4(clientIp);
	const family = ipFamily(ip);
	if (!(agent && family)) {
		return "ua_only";
	}
	const cacheKey = `${agent.id}:${ip}`;
	const cached = verificationCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	await Promise.race([ensureIpRanges(), Bun.sleep(FIRST_LOAD_WAIT_MS)]);
	const list = blockListsByAgentId?.get(agent.id);
	let verification: AgentVerification | null;
	if (list?.check(ip, family)) {
		verification = "ip_verified";
	} else if (agent.dnsMasks.length > 0) {
		verification = await verifyByReverseDns(agent.dnsMasks, ip, family);
	} else {
		verification = list ? "spoofed" : "ua_only";
	}
	if (!verification) {
		return "ua_only";
	}
	if (blockListsByAgentId) {
		verificationCache.set(cacheKey, verification);
	}
	return verification;
}
