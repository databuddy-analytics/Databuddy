import Redis from "ioredis";
import { createRedisConnectionOptions, getRedisUrl } from "./redis-options";

let redisInstance: Redis | null = null;

export async function shutdownRedis() {
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
