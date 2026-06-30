import { beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = new Map<string, string>();
let failGet = false;
let failSet = false;
let redisUnavailable = false;

const mockRedisClient = {
	get: vi.fn(async (key: string) => {
		if (failGet) {
			throw new Error("redis get failed");
		}
		return redisStore.get(key) ?? null;
	}),
	setex: vi.fn(async (key: string, _ttl: number, value: string) => {
		if (failSet) {
			throw new Error("redis set failed");
		}
		redisStore.set(key, value);
		return "OK";
	}),
};

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
	cacheable: <T extends (...args: never[]) => unknown>(fn: T) => fn,
	clearActiveStream: vi.fn(async () => undefined),
	closeInsightsQueue: vi.fn(async () => undefined),
	closeUptimeQueue: vi.fn(async () => undefined),
	createDrizzleCache: () => ({}),
	getActiveStream: vi.fn(async () => null),
	getAgentContextSnapshotKey: (
		userId: string,
		websiteId: string,
		organizationId?: string | null
	) => `agent:context-snapshot:${organizationId ?? userId}:${websiteId}`,
	getBullMQConnectionOptions: vi.fn(() => ({})),
	getBullMQWorkerConnectionOptions: vi.fn(() => ({})),
	getCachedLink: vi.fn(async () => null),
	getCacheableKey: vi.fn(
		(prefix: string, args: unknown[]) => `${prefix}:${JSON.stringify(args)}`
	),
	getLinkCacheKey: vi.fn((slug: string) => `link:${slug}`),
	getRateLimitHeaders: vi.fn(() => ({})),
	getRedisCache: () => {
		if (redisUnavailable) {
			throw new Error("redis unavailable");
		}
		return mockRedisClient;
	},
	getInsightsQueue: vi.fn(() => ({})),
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

const { appendToConversation, getConversationHistory } = await import(
	"./conversation-store"
);

beforeEach(() => {
	redisStore.clear();
	failGet = false;
	failSet = false;
	redisUnavailable = false;
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
});

describe("conversation store", () => {
	it("returns no history when Redis is unavailable", async () => {
		redisUnavailable = true;

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([]);
	});

	it("returns no history when Redis reads time out", async () => {
		failGet = true;

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([]);
	});

	it("does not fail the caller when Redis writes time out", async () => {
		failSet = true;

		await expect(
			appendToConversation("conv-1", "user-1", null, "hello", "hi")
		).resolves.toBeUndefined();
	});

	it("persists the most recent turns", async () => {
		await appendToConversation("conv-1", "user-1", null, "hello", "hi");

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([
			{ content: "hello", role: "user" },
			{ content: "hi", role: "assistant" },
		]);
	});
});
