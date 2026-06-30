import { beforeEach, describe, expect, it, vi } from "vitest";

interface RedisEntry {
	ttl: number;
	value: string;
}

const redisStore = new Map<string, RedisEntry>();
let failGet = false;
let failSet = false;
let memoryEnabled = true;

const getSnapshotKey = (
	userId: string,
	websiteId: string,
	organizationId?: string | null
) => `agent:context-snapshot:${organizationId ?? userId}:${websiteId}`;

const mockRedisClient = {
	get: vi.fn(async (key: string) => {
		if (failGet) {
			throw new Error("redis get failed");
		}
		return redisStore.get(key)?.value ?? null;
	}),
	setex: vi.fn(async (key: string, ttl: number, value: string) => {
		if (failSet) {
			throw new Error("redis set failed");
		}
		redisStore.set(key, { ttl, value });
		return "OK";
	}),
};

const mockCaptureError = vi.fn(
	(_error: unknown, _fields?: Record<string, string | number | boolean>) => {}
);

const mockEnrichAgentContext = vi.fn(
	async (opts: {
		organizationId: string | null;
		userId: string;
		websiteId: string;
	}) => `fresh:${opts.organizationId ?? opts.userId}:${opts.websiteId}`
);

const passthroughCacheable = <T extends (...args: never[]) => unknown>(fn: T) =>
	fn;

vi.mock("@databuddy/auth", () => ({
	auth: {},
	websitesApi: {
		hasPermission: vi.fn(async () => ({ success: true })),
	},
}));

vi.mock("@databuddy/redis", () => ({
	AGENT_CONTEXT_SNAPSHOT_PREFIX: "agent:context-snapshot",
	UPTIME_CHECK_JOB_NAME: "uptime-check",
	UPTIME_JOB_OPTIONS: {},
	UPTIME_JOB_TIMEOUT_MS: 60_000,
	UPTIME_QUEUE_NAME: "uptime-checks",
	INSIGHTS_DISPATCH_JOB_NAME: "insights-dispatch",
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME: "insights-generate-website",
	INSIGHTS_JOB_OPTIONS: {},
	INSIGHTS_JOB_TIMEOUT_MS: 120_000,
	INSIGHTS_QUEUE_ENV_PREFIX: "INSIGHTS",
	INSIGHTS_QUEUE_NAME: "insights-generation",
	INSIGHTS_ROLLUP_JOB_NAME: "insights-rollup",
	activeStreamKey: (id: string) => `active:${id}`,
	appendStreamChunk: vi.fn(async () => undefined),
	cacheNamespaces: {
		agentTelemetryWebsiteExists: "agent-telemetry:website-exists",
		apiKeyByHash: "api-key-by-hash",
		apiKeyOwnerId: "api_key_owner_id",
		billingOwner: "rpc:billing_owner",
		flag: "flag",
		flagsClient: "flags-client",
		flagsDefinitions: "flags-definitions",
		flagsUser: "flags-user",
		insightsNarrative: "insights-narrative",
		mcpInsights: "mcp:insights",
		memberRole: "rpc:member_role",
		organizationOwner: "rpc:org_owner",
		organizationRole: "rpc:org_role",
		slackChannelBinding: "slack-channel-binding",
		slackIntegrationByTeam: "slack-integration-by-team",
		statusPage: "status-page",
		userPreferences: "user-prefs",
		websiteById: "website_by_id",
		websiteCache: "website-cache",
		websiteDomain: "website-domain",
		websiteDomainsBatch: "website-domains-batch",
		websiteWithOwner: "website_with_owner_v2",
	},
	cacheTags: {
		billingOwner: (ownerId: string) => `billing-owner:${ownerId}`,
		flagClient: (clientId: string) => `flag-client:${clientId}`,
		flagKey: (clientId: string, flagKey: string) =>
			`flag-key:${clientId}:${flagKey}`,
		flagUser: (clientId: string, userId: string) =>
			`flag-user:${clientId}:${userId}`,
		organization: (organizationId: string) => `organization:${organizationId}`,
		website: (websiteId: string) => `website:${websiteId}`,
	},
	cacheable: passthroughCacheable,
	clearActiveStream: vi.fn(async () => undefined),
	closeInsightsQueue: vi.fn(async () => undefined),
	closeUptimeQueue: vi.fn(async () => undefined),
	createDrizzleCache: () => ({}),
	getActiveStream: vi.fn(async () => null),
	getAgentContextSnapshotKey: getSnapshotKey,
	getBullMQConnectionOptions: vi.fn(() => ({})),
	getBullMQWorkerConnectionOptions: vi.fn(() => ({})),
	getCachedLink: vi.fn(async () => null),
	getCacheableKey: vi.fn(
		(prefix: string, args: unknown[]) => `${prefix}:${JSON.stringify(args)}`
	),
	getLinkCacheKey: vi.fn((slug: string) => `link:${slug}`),
	getRateLimitHeaders: vi.fn(() => ({})),
	getInsightsQueue: vi.fn(() => ({})),
	getRedisCache: () => mockRedisClient,
	getUptimeQueue: vi.fn(() => ({})),
	invalidateAgentContextSnapshot: vi.fn(async () => 0),
	invalidateAgentContextSnapshotsForOwner: vi.fn(async () => 0),
	invalidateAgentContextSnapshotsForWebsite: vi.fn(async () => 0),
	invalidateCacheableKey: vi.fn(async () => 0),
	invalidateCacheablePattern: vi.fn(async () => 0),
	invalidateCacheablePrefix: vi.fn(async () => 0),
	invalidateCacheableTag: vi.fn(async () => 0),
	invalidateCacheableTags: vi.fn(async () => ({ attempted: 0, failed: 0 })),
	invalidateCacheableWithArgs: vi.fn(async () => 0),
	invalidateBillingOwnerCaches: vi.fn(async () => ({
		attempted: 0,
		failed: 0,
	})),
	invalidateFlagReadCaches: vi.fn(async () => ({ attempted: 0, failed: 0 })),
	invalidateInsightsCachesForOrganization: vi.fn(async () => ({
		attempted: 0,
		failed: 0,
	})),
	invalidateLinkCache: vi.fn(async () => undefined),
	invalidateLinkCaches: vi.fn(async () => undefined),
	invalidateOrganizationMembershipCaches: vi.fn(async () => ({
		attempted: 0,
		failed: 0,
	})),
	invalidateSlackChannelBindingCache: vi.fn(async () => undefined),
	invalidateSlackIntegrationCache: vi.fn(async () => undefined),
	invalidateStatusPageCache: vi.fn(async () => 0),
	invalidateUserPreferencesCache: vi.fn(async () => undefined),
	invalidateWebsiteReadCaches: vi.fn(async () => ({
		attempted: 0,
		failed: 0,
	})),
	insightsRollupJobId: (runId: string) => `insights-rollup-${runId}`,
	insightsWebsiteJobId: (runId: string, websiteId: string) =>
		`insights-website-${runId}-${websiteId}`,
	isClickRecorded: vi.fn(async () => false),
	markStreamDone: vi.fn(async () => undefined),
	ratelimit: vi.fn(async () => ({ success: true })),
	readStreamHistory: vi.fn(async () => []),
	redis: mockRedisClient,
	setActiveStream: vi.fn(async () => undefined),
	setCachedLink: vi.fn(async () => undefined),
	setCachedLinkNotFound: vi.fn(async () => undefined),
	shouldRecordClick: vi.fn(async () => true),
	shutdownRedis: vi.fn(async () => undefined),
	streamBufferKey: (id: string) => `stream:${id}`,
	uptimeImmediateJobId: (id: string) => `uptime:immediate:${id}`,
	uptimeSchedulerId: (id: string) => `uptime:scheduler:${id}`,
}));

vi.mock("../../lib/supermemory", () => ({
	formatMemoryForPrompt: vi.fn(() => ""),
	forgetMemory: vi.fn(async () => ({ success: true })),
	getMemoryContext: vi.fn(async () => null),
	isMemoryEnabled: () => memoryEnabled,
	sanitizeMemoryContent: vi.fn((content: string) => content),
	saveCuratedMemory: vi.fn(async () => ({ id: "memory-1" })),
	searchMemories: vi.fn(async () => []),
	storeAnalyticsSummary: vi.fn(async () => undefined),
	storeConversation: vi.fn(async () => undefined),
}));

vi.mock("../../lib/tracing", () => ({
	captureError: mockCaptureError,
	mergeWideEvent: vi.fn(() => {}),
}));

vi.mock("../config/enrich-context", () => ({
	enrichAgentContext: mockEnrichAgentContext,
}));

const { getAgentContextSnapshot, shouldLoadMemoryContext } = await import(
	"./cache"
);

const snapshot = (context: string, refreshedAt = new Date().toISOString()) =>
	JSON.stringify({ context, refreshedAt });

async function flushBackgroundRefresh() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	redisStore.clear();
	failGet = false;
	failSet = false;
	memoryEnabled = true;
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
	mockEnrichAgentContext.mockClear();
	mockCaptureError.mockClear();
});

describe("shouldLoadMemoryContext", () => {
	it("keeps ordinary analytics prompts off the inline memory path", () => {
		expect(shouldLoadMemoryContext("show me bounce rate for last week")).toBe(
			false
		);
	});

	it("loads memory inline when the user explicitly asks for remembered context", () => {
		expect(shouldLoadMemoryContext("remember my usual conversion goal?")).toBe(
			true
		);
	});

	it("stays disabled when memory is not configured", () => {
		memoryEnabled = false;

		expect(shouldLoadMemoryContext("what do you know about me?")).toBe(false);
	});
});

describe("getAgentContextSnapshot", () => {
	it("returns a fresh cache hit without rebuilding context", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { ttl: 86_400, value: snapshot("cached") });

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");

		expect(result).toEqual({ context: "cached", source: "hit" });
		expect(mockEnrichAgentContext).not.toHaveBeenCalled();
	});

	it("serves stale context immediately and refreshes it in the background", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, {
			ttl: 86_400,
			value: snapshot("old", "1970-01-01T00:00:00.000Z"),
		});

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "old", source: "stale" });
		expect(mockEnrichAgentContext).toHaveBeenCalledTimes(1);
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
		expect(redisStore.get(key)?.ttl).toBe(86_400);
	});

	it("returns a miss fast and warms the snapshot for the next request", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(mockEnrichAgentContext).toHaveBeenCalledTimes(1);
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
	});

	it("treats invalid snapshot payloads as misses and replaces them", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { ttl: 86_400, value: JSON.stringify({}) });

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
	});

	it("does not block the request when Redis get fails", async () => {
		const key = getSnapshotKey("user-1", "site-1", null);
		failGet = true;

		const result = await getAgentContextSnapshot("user-1", "site-1", null);
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "error" });
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:user-1:site-1",
		});
	});

	it("captures background refresh failures", async () => {
		failSet = true;

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(mockCaptureError).toHaveBeenCalledTimes(1);
		expect(mockCaptureError.mock.calls[0]?.[1]).toMatchObject({
			agent_context_snapshot_refresh_error: true,
			agent_snapshot_key: getSnapshotKey("user-1", "site-1", "org-1"),
		});
	});
});
