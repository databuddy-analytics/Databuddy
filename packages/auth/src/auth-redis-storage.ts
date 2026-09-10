import { redisStorage } from "@better-auth/redis-storage";
import { getRedisCache, runAuthCacheCommand } from "@databuddy/redis";

export function createAuthSecondaryStorage() {
	const storage = redisStorage({
		client: getRedisCache(),
		keyPrefix: "ba:",
	});

	return {
		get: (key: string) => runAuthCacheCommand(() => storage.get(key)),
		getAndDelete: (key: string) =>
			runAuthCacheCommand(() => storage.getAndDelete(key)),
		set: (key: string, value: string, ttl?: number) =>
			runAuthCacheCommand(() => storage.set(key, value, ttl)),
		delete: (key: string) => runAuthCacheCommand(() => storage.delete(key)),
		listKeys: () => runAuthCacheCommand(() => storage.listKeys()),
		clear: () => runAuthCacheCommand(() => storage.clear()),
	};
}
