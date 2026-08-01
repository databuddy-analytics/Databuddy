import Redis from "ioredis";
import {
	createLinkCacheRedisConnectionOptions,
	createRateLimitRedisConnectionOptions,
	createRedisConnectionOptions,
	getRedisUrl,
} from "./redis-options";

let redisInstance: Redis | null = null;
let linkCacheRedisInstance: Redis | null = null;
let linkCacheConnectPromise: Promise<Redis> | null = null;
let rateLimitRedisInstance: Redis | null = null;
let rateLimitConnectPromise: Promise<Redis> | null = null;

const LINK_CACHE_CONNECT_DEADLINE_MS = 1250;
export const LINK_CACHE_OPERATION_DEADLINE_MS = 1500;
const RATE_LIMIT_CONNECT_DEADLINE_MS = 1250;
export const RATE_LIMIT_OPERATION_DEADLINE_MS = 1500;

function withDeadline<T>(
	operation: Promise<T>,
	timeoutMs: number,
	message: string
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
		timeout.unref?.();
	});
	return Promise.race([operation, deadline]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
}

function discardLinkCacheRedis(instance: Redis): void {
	if (linkCacheRedisInstance === instance) {
		linkCacheRedisInstance = null;
	}
	try {
		instance.disconnect(false);
	} catch {
		// The instance is already closed.
	}
}

function getLinkCacheRedis(): Promise<Redis> {
	if (linkCacheRedisInstance?.status === "ready") {
		return Promise.resolve(linkCacheRedisInstance);
	}
	if (linkCacheConnectPromise) {
		return linkCacheConnectPromise;
	}

	const instance = new Redis(
		getRedisUrl(),
		createLinkCacheRedisConnectionOptions()
	);
	linkCacheRedisInstance = instance;
	instance.on("end", () => {
		if (linkCacheRedisInstance === instance) {
			linkCacheRedisInstance = null;
		}
	});

	const connection = withDeadline(
		instance.connect().then(() => instance),
		LINK_CACHE_CONNECT_DEADLINE_MS,
		`Link cache connection exceeded ${LINK_CACHE_CONNECT_DEADLINE_MS}ms`
	).catch((error) => {
		discardLinkCacheRedis(instance);
		throw error;
	});
	linkCacheConnectPromise = connection;
	const clearConnection = () => {
		if (linkCacheConnectPromise === connection) {
			linkCacheConnectPromise = null;
		}
	};
	connection.then(clearConnection, clearConnection);
	return connection;
}

function discardRateLimitRedis(instance: Redis): void {
	if (rateLimitRedisInstance === instance) {
		rateLimitRedisInstance = null;
	}
	try {
		instance.disconnect(false);
	} catch {
		// The instance is already closed.
	}
}

function getRateLimitRedis(): Promise<Redis> {
	if (rateLimitRedisInstance?.status === "ready") {
		return Promise.resolve(rateLimitRedisInstance);
	}
	if (rateLimitConnectPromise) {
		return rateLimitConnectPromise;
	}

	const instance = new Redis(
		getRedisUrl(),
		createRateLimitRedisConnectionOptions()
	);
	rateLimitRedisInstance = instance;
	instance.on("end", () => {
		if (rateLimitRedisInstance === instance) {
			rateLimitRedisInstance = null;
		}
	});

	const connection = withDeadline(
		instance.connect().then(() => instance),
		RATE_LIMIT_CONNECT_DEADLINE_MS,
		`Rate limit connection exceeded ${RATE_LIMIT_CONNECT_DEADLINE_MS}ms`
	).catch((error) => {
		discardRateLimitRedis(instance);
		throw error;
	});
	rateLimitConnectPromise = connection;
	const clearConnection = () => {
		if (rateLimitConnectPromise === connection) {
			rateLimitConnectPromise = null;
		}
	};
	connection.then(clearConnection, clearConnection);
	return connection;
}

export function runLinkCacheCommand<T>(
	operation: (redis: Redis) => Promise<T>
): Promise<T> {
	return runLinkCacheRedisCommand(operation);
}

/**
 * Execute admission-control work on its own bounded, no-offline-queue Redis
 * connection. Rate limiting is fail-open, so it must neither inherit the
 * shared client's retry window nor head-of-line block link cache mutations.
 */
export function runRateLimitCommand<T>(
	operation: (redis: Redis) => Promise<T>
): Promise<T> {
	return runRateLimitRedisCommand(operation);
}

async function runLinkCacheRedisCommand<T>(
	operation: (redis: Redis) => Promise<T>
): Promise<T> {
	let instance: Redis | null = null;
	const command = getLinkCacheRedis().then((redis) => {
		instance = redis;
		return operation(redis);
	});

	try {
		return await withDeadline(
			command,
			LINK_CACHE_OPERATION_DEADLINE_MS,
			`Link cache operation exceeded ${LINK_CACHE_OPERATION_DEADLINE_MS}ms`
		);
	} catch (error) {
		if (instance) {
			discardLinkCacheRedis(instance);
		}
		throw error;
	}
}

async function runRateLimitRedisCommand<T>(
	operation: (redis: Redis) => Promise<T>
): Promise<T> {
	let instance: Redis | null = null;
	const command = getRateLimitRedis().then((redis) => {
		instance = redis;
		return operation(redis);
	});

	try {
		return await withDeadline(
			command,
			RATE_LIMIT_OPERATION_DEADLINE_MS,
			`Rate limit operation exceeded ${RATE_LIMIT_OPERATION_DEADLINE_MS}ms`
		);
	} catch (error) {
		if (instance) {
			discardRateLimitRedis(instance);
		}
		throw error;
	}
}

export async function shutdownRedis() {
	const linkCacheInstance = linkCacheRedisInstance;
	linkCacheRedisInstance = null;
	linkCacheConnectPromise = null;
	if (linkCacheInstance) {
		discardLinkCacheRedis(linkCacheInstance);
	}
	const rateLimitInstance = rateLimitRedisInstance;
	rateLimitRedisInstance = null;
	rateLimitConnectPromise = null;
	if (rateLimitInstance) {
		discardRateLimitRedis(rateLimitInstance);
	}

	if (!redisInstance) {
		return;
	}
	const instance = redisInstance;
	redisInstance = null;
	try {
		await instance.quit();
	} catch {
		instance.disconnect();
	}
}

export function getRedisCache() {
	if (redisInstance) {
		return redisInstance;
	}

	const instance = new Redis(getRedisUrl(), createRedisConnectionOptions());
	redisInstance = instance;

	instance.on("error", (error) => {
		console.error("[redis] client error:", error);
	});
	instance.on("end", () => {
		if (redisInstance === instance) {
			redisInstance = null;
		}
	});
	process.on("SIGTERM", shutdownRedis);
	process.on("SIGINT", shutdownRedis);

	return instance;
}

export const redis = new Proxy({} as Redis, {
	get(_, prop) {
		return Reflect.get(getRedisCache(), prop);
	},
});
