type RedisModule = typeof import("@databuddy/redis");

const noop = () => undefined;
const noopAsync = async () => undefined;

const pureFunctionExports = [
	"activeStreamKey",
	"getAgentContextSnapshotKey",
	"getCacheableKey",
	"getCacheableTagIndexKey",
	"getLinkCacheKey",
	"getRateLimitHeaders",
	"insightsResumeJobId",
	"insightsWebsiteJobId",
	"streamBufferKey",
	"uptimeDeliveryJobId",
	"uptimeImmediateJobId",
	"uptimeSchedulerId",
] as const satisfies readonly (keyof RedisModule)[];

/**
 * Preserves the full Redis barrel shape while making every effectful function
 * inert by default. New function exports therefore cannot open Redis or
 * BullMQ connections from a test that only needs a small mocked surface.
 */
export function createInertRedisModule(
	actualRedis: RedisModule,
	options: { getRedisCache: () => unknown; redis: unknown }
): RedisModule {
	const module: Record<string, unknown> = Object.fromEntries(
		Object.entries(actualRedis).map(([name, value]) => [
			name,
			typeof value === "function" ? noop : value,
		])
	);

	for (const name of pureFunctionExports) {
		module[name] = actualRedis[name];
	}

	return {
		...module,
		cacheable: <T extends (...args: never[]) => unknown>(fn: T) => fn,
		createDrizzleCache: () => ({
			cleanupEmptySets: noopAsync,
			invalidateByKey: noopAsync,
			invalidateByTables: noopAsync,
			invalidateByTags: noopAsync,
			withCache: async <T>({ queryFn }: { queryFn: () => Promise<T> }) =>
				queryFn(),
		}),
		default: options.redis,
		getRedisCache: options.getRedisCache,
		redis: options.redis,
	} as unknown as RedisModule;
}
