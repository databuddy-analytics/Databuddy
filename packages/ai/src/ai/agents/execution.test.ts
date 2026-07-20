import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const originalAutumnSecretKey = process.env.AUTUMN_SECRET_KEY;

const mockAutumnCheck = mock(async () => ({
	allowed: true,
	balance: {
		granted: 100,
		remaining: 42,
		unlimited: false,
		usage: 58,
	},
}));
const mockAutumnTrack = mock(async () => undefined);
const mockGetBillingCustomerId = mock(
	async (userId: string, organizationId?: string | null) =>
		organizationId ? `billing:${organizationId}:${userId}` : `billing:${userId}`
);
const mockGetOrganizationOwnerId = mock(async (organizationId: string) =>
	organizationId === "org_missing" ? null : `owner:${organizationId}`
);
const mockMergeWideEvent = mock((_: Record<string, unknown>) => {});

mock.module("@databuddy/rpc/autumn", () => ({
	getAutumn: () => ({
		check: mockAutumnCheck,
		track: mockAutumnTrack,
	}),
}));

mock.module("@databuddy/rpc/billing", () => ({
	getBillingCustomerId: mockGetBillingCustomerId,
	getBillingOwner: mock(
		async (userId: string, organizationId?: string | null) => ({
			canUserUpgrade: true,
			customerId: await mockGetBillingCustomerId(userId, organizationId),
			isOrganization: Boolean(organizationId),
			planId: "free",
		})
	),
}));

mock.module("@databuddy/rpc/organization", () => ({
	getMemberRole: mock(async () => "owner"),
	getOrganizationOwnerId: mockGetOrganizationOwnerId,
}));

mock.module("../../lib/databuddy", () => ({
	trackAgentEvent: mock(() => {}),
}));

mock.module("../../lib/tracing", () => ({
	captureError: mock(() => {}),
	mergeWideEvent: mockMergeWideEvent,
}));

const {
	ensureAgentCreditsAvailable,
	isAgentBillingConfigured,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} = await import("./execution");

type AgentPrincipal = Parameters<typeof resolveAgentBillingCustomerId>[0];
type ApiKeyPrincipal = NonNullable<AgentPrincipal["apiKey"]>;

beforeEach(() => {
	process.env.AUTUMN_SECRET_KEY = "test-autumn-secret";
	mockAutumnCheck.mockClear();
	mockAutumnTrack.mockClear();
	mockGetBillingCustomerId.mockClear();
	mockGetOrganizationOwnerId.mockClear();
	mockMergeWideEvent.mockClear();
});

afterAll(() => {
	if (originalAutumnSecretKey === undefined) {
		delete process.env.AUTUMN_SECRET_KEY;
	} else {
		process.env.AUTUMN_SECRET_KEY = originalAutumnSecretKey;
	}
});

describe("resolveAgentBillingCustomerId", () => {
	it("bills the organization owner for org-scoped automation keys without a user", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: {
				organizationId: "org_slack",
				userId: null,
			} as ApiKeyPrincipal,
			organizationId: null,
			userId: null,
		});

		expect(customerId).toBe("owner:org_slack");
		expect(mockGetOrganizationOwnerId).toHaveBeenCalledWith("org_slack");
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_billing_resolution: "api_key_org_owner",
				billing_customer_id: "owner:org_slack",
				organization_id: "org_slack",
			})
		);
	});

	it("bills the organization owner for org-scoped API keys even when the key has a user", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: {
				organizationId: "org_slack",
				userId: "installer_123",
			} as ApiKeyPrincipal,
			organizationId: null,
			userId: "installer_123",
		});

		expect(customerId).toBe("owner:org_slack");
		expect(mockGetOrganizationOwnerId).toHaveBeenCalledWith("org_slack");
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
	});

	it("uses the standard billing owner resolver for session users", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: "org_slack",
			userId: "user_123",
		});

		expect(customerId).toBe("billing:org_slack:user_123");
		expect(mockGetBillingCustomerId).toHaveBeenCalledWith(
			"user_123",
			"org_slack"
		);
		expect(mockGetOrganizationOwnerId).not.toHaveBeenCalled();
	});

	it("returns null when neither a user nor organization can be resolved", async () => {
		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: null,
			userId: null,
		});

		expect(customerId).toBeNull();
	});

	it("does not resolve a billing owner when Autumn is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const customerId = await resolveAgentBillingCustomerId({
			apiKey: null,
			organizationId: "self-hosted-org",
			userId: "self-hosted-user",
		});

		expect(isAgentBillingConfigured()).toBe(false);
		expect(customerId).toBeNull();
		expect(mockGetBillingCustomerId).not.toHaveBeenCalled();
		expect(mockGetOrganizationOwnerId).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_billing_resolution: "billing_disabled",
				organization_id: "self-hosted-org",
			})
		);
	});
});

describe("ensureAgentCreditsAvailable", () => {
	it("logs the checked Autumn customer and balance", async () => {
		const allowed = await ensureAgentCreditsAvailable("owner:org_slack");

		expect(allowed).toBe(true);
		expect(mockAutumnCheck).toHaveBeenCalledWith({
			customerId: "owner:org_slack",
			featureId: "agent_credits",
			requiredBalance: 0.01,
		});
		expect(mockMergeWideEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				agent_credits_allowed: true,
				agent_credits_feature_id: "agent_credits",
				agent_credits_granted: 100,
				agent_credits_remaining: 42,
				agent_credits_unlimited: false,
				agent_credits_usage: 58,
				billing_customer_id: "owner:org_slack",
			})
		);
	});

	it("skips Autumn when billing is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const allowed = await ensureAgentCreditsAvailable("self-hosted-user");

		expect(allowed).toBe(true);
		expect(mockAutumnCheck).not.toHaveBeenCalled();
		expect(mockMergeWideEvent).toHaveBeenCalledWith({
			agent_credits_allowed: true,
			agent_credits_check_skipped: true,
		});
	});
});

describe("trackAgentUsageAndBill", () => {
	it("bills direct agent credits from the actual model cost", async () => {
		const summary = await trackAgentUsageAndBill({
			billingCustomerId: "owner:org_slack",
			modelId: "anthropic/claude-sonnet-4.6",
			source: "dashboard",
			usage: {
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			},
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("anthropic/claude-sonnet-4.6");
		expect(summary.cost_total_usd).toBe(18);
		expect(summary.agent_credits_used).toBe(360);
		expect(mockAutumnTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				customerId: "owner:org_slack",
				featureId: "agent_credits",
				value: 360,
			})
		);
	});

	it("uses DeepSeek pricing for Slack instead of the Sonnet fallback", async () => {
		const summary = await trackAgentUsageAndBill({
			billingCustomerId: "owner:org_slack",
			modelId: "deepseek/deepseek-v4-flash",
			source: "slack",
			usage: {
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			},
		});

		expect(summary.cost_fallback).toBe(false);
		expect(summary.cost_model_id).toBe("deepseek/deepseek-v4-flash");
		expect(summary.cost_total_usd).toBe(0.42);
		expect(summary.agent_credits_used).toBe(8.4);
		expect(mockAutumnTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				featureId: "agent_credits",
				value: 8.4,
			})
		);
	});

	it("deduplicates retryable usage charges", async () => {
		await trackAgentUsageAndBill({
			billingCustomerId: "owner:org_slack",
			idempotencyKey: "insights:run-1:site-1",
			modelId: "anthropic/claude-sonnet-4.6",
			source: "insights",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});

		expect(mockAutumnTrack).toHaveBeenCalledWith(
			expect.objectContaining({ featureId: "agent_credits" }),
			{ headers: { "Idempotency-Key": "insights:run-1:site-1" } }
		);
	});

	it("records usage without billing when Autumn is not configured", async () => {
		delete process.env.AUTUMN_SECRET_KEY;

		const summary = await trackAgentUsageAndBill({
			billingCustomerId: "self-hosted-user",
			modelId: "anthropic/claude-sonnet-4.6",
			source: "insights",
			usage: { inputTokens: 1000, outputTokens: 100 },
		});

		expect(summary.agent_credits_used).toBeGreaterThan(0);
		expect(mockAutumnTrack).not.toHaveBeenCalled();
	});
});
