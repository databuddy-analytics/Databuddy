import type { RedisOptions } from "ioredis";

export interface BullMQConnectionConfig {
	envPrefix?: string;
}

function resolveBullMQRedisUrl(config: BullMQConnectionConfig = {}): string {
	const prefixedName = config.envPrefix
		? `${config.envPrefix}_BULLMQ_REDIS_URL`
		: null;
	const prefixedUrl = prefixedName ? process.env[prefixedName]?.trim() : "";
	const fallbackUrl = process.env.BULLMQ_REDIS_URL?.trim();
	const redisUrl = prefixedUrl || fallbackUrl;
	if (!redisUrl) {
		throw new Error(
			`${prefixedName ? `${prefixedName} or ` : ""}BULLMQ_REDIS_URL environment variable is required`
		);
	}
	return redisUrl;
}

function parseBullMQConnectionUrl(
	config: BullMQConnectionConfig = {}
): RedisOptions {
	const redisUrl = resolveBullMQRedisUrl(config);

	const url = new URL(redisUrl);

	return {
		host: url.hostname,
		port: Number(url.port) || 6379,
		username: url.username || undefined,
		password: url.password || undefined,
		db: url.pathname ? Number(url.pathname.slice(1)) : undefined,
		...(url.protocol === "rediss:" ? { tls: {} } : {}),
	};
}

export function getBullMQConnectionOptions(
	config: BullMQConnectionConfig = {}
): RedisOptions {
	return {
		...parseBullMQConnectionUrl(config),
		maxRetriesPerRequest: 1,
	};
}

export function getBullMQWorkerConnectionOptions(
	config: BullMQConnectionConfig = {}
): RedisOptions {
	return {
		...parseBullMQConnectionUrl(config),
		maxRetriesPerRequest: null,
	};
}
